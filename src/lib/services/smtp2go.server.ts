/**
 * SMTP2GO HTTP client. Server-only — it carries the API key.
 *
 * HTTP, not SMTP, and not by preference: this deploys to Cloudflare Workers,
 * which have no socket stack an SMTP library could use. The SMTP credentials
 * on the same account exist for Supabase Auth, which sends the verification
 * mail from its own infrastructure and never passes through here.
 */

import { getSmtp2goApiBase, getSmtp2goApiKey } from "@/lib/env.server";
import {
  activitySearchResponseSchema,
  apiErrorResponseSchema,
  sendResponseSchema,
  type ActivityEvent,
} from "@/lib/schemas/email";

/** Hung-request cap, so a stalled provider cannot wedge a background job. */
const TIMEOUT_MS = 20_000;

/**
 * One authenticated POST. Returns the status alongside the body because the
 * two disagree here: a refused send comes back as HTTP 200, so callers decide
 * what happened by reading both.
 */
async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${getSmtp2goApiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Header rather than the `api_key` body field the API also accepts: a
      // body is what gets logged when a request is traced.
      "X-Smtp2go-Api-Key": getSmtp2goApiKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, json: await response.json().catch(() => undefined) };
}

/** What a send attempt produced, in the shape `email_sends` stores. */
export type SendResult = { ok: true; providerMessageId: string } | { ok: false; error: string };

export type SendEmailInput = {
  sender: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
};

/**
 * Sends one email.
 *
 * Three response shapes have been observed live and all three are handled
 * here, because `response.ok` alone gets two of them wrong:
 *
 *   1. HTTP 400 with `data.error`      — malformed address, bad permission.
 *   2. HTTP 200 with `data.failed > 0` — accepted as a request, refused as a
 *      send. `email_id` comes back as `""`.
 *   3. HTTP 200 with `data.succeeded`  — handed to the provider.
 *
 * Shape 2 is the trap: a naive `if (response.ok)` records an unsent email as
 * sent, and the ladder then waits forever for a reply to a message nobody
 * received.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const { status, json } = await post("/email/send", {
    sender: input.sender,
    to: [input.to],
    subject: input.subject,
    text_body: input.textBody,
    ...(input.htmlBody ? { html_body: input.htmlBody } : {}),
  });

  if (status >= 400) {
    const parsed = apiErrorResponseSchema.safeParse(json);
    if (!parsed.success) return { ok: false, error: `Send failed with HTTP ${status}.` };
    const { error, field_validation_errors: field } = parsed.data.data;
    return { ok: false, error: field?.message ? `${error} (${field.message})` : error };
  }

  const parsed = sendResponseSchema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "The provider returned an unreadable response." };

  const { succeeded, failures, email_id } = parsed.data.data;
  // `email_id` is `""` on refusal, never null. Empty string is a value, and
  // `email_sends.provider_message_id` refuses it precisely so this cannot be
  // stored as if it identified something.
  if (succeeded < 1 || email_id === "") {
    return { ok: false, error: failures[0] ?? "The provider refused the message." };
  }
  return { ok: true, providerMessageId: email_id };
}

export type ActivityPage = {
  events: ActivityEvent[];
  continueToken: string | undefined;
};

/**
 * One page of delivery events.
 *
 * Verified against the live API, because its published reference 404s and the
 * endpoint ignores parameters it does not recognise — so an accepted request
 * is no evidence a filter was applied:
 *
 *   - `start_date` / `end_date` do filter (a 2020 window returns nothing).
 *   - `limit` caps the page and adds `continue_token` when more remain;
 *     consecutive pages do not overlap.
 *   - `email_id` is **ignored**. Filtering by message has to happen here.
 */
export async function searchActivity(params: {
  startDate: string;
  endDate: string;
  limit?: number;
  continueToken?: string | undefined;
}): Promise<ActivityPage> {
  const { status, json } = await post("/activity/search", {
    start_date: params.startDate,
    end_date: params.endDate,
    limit: params.limit ?? 100,
    ...(params.continueToken ? { continue_token: params.continueToken } : {}),
  });

  if (status >= 400) {
    const parsed = apiErrorResponseSchema.safeParse(json);
    throw new Error(
      parsed.success ? parsed.data.data.error : `Activity search failed (${status}).`,
    );
  }

  const parsed = activitySearchResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error("The provider returned an unreadable activity page.");

  return {
    events: parsed.data.data.events,
    continueToken: parsed.data.data.continue_token,
  };
}
