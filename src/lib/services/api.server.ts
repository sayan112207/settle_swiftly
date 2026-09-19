/**
 * Shared plumbing for the `/api/v1` server routes: the error envelope, the
 * caller (session + active org), pagination past PostgREST's row cap, and the
 * mapping from RPC error codes to HTTP responses.
 *
 * Reads and RPC calls go through the caller-bound Supabase client, so RLS (or
 * the RPC's own membership check) decides what exists; `org_id` filters only
 * pick which of the caller's orgs to show.
 */

import type { ZodError } from "zod";

import { retryOnJwtSkew } from "@/lib/supabase/jwt-skew-retry";
import { getUserSupabase } from "@/lib/supabase/user-client.server";

export type Supabase = ReturnType<typeof getUserSupabase>;

/**
 * A failure with a contract error envelope. `message` is user-facing copy and
 * is rendered verbatim by the frontend, so it never carries internal detail.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** A JSON response with the contract's content type. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * Runs a handler and turns any failure into the contract's error envelope.
 *
 * Unexpected errors are logged in full and answered with `fallback`, so a
 * Postgres message never reaches the browser.
 */
export async function handleApi(
  fallback: { code: string; message: string },
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    const mapped = fromRpcError(error);
    if (mapped) {
      return json({ error: { code: mapped.code, message: mapped.message } }, mapped.status);
    }
    console.error(`[api] ${fallback.code}`, error);
    return json({ error: fallback }, 500);
  }
}

/** The signed-in user and the org being shown. */
export type Caller = { supabase: Supabase; userId: string; orgId: string; timezone: string };

/**
 * Resolves the caller. With several memberships this is the oldest one — the
 * same org the app shell names, since `getAuthContext` returns memberships in
 * the same order.
 */
export async function resolveCaller(): Promise<Caller> {
  const supabase = getUserSupabase();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new ApiError(401, "unauthenticated", "Your session expired. Please sign in again.");
  }

  // Retried once on PGRST303 (JWT issued at future): right after an OAuth
  // sign-in this is the first PostgREST call, and a brief clock drift between
  // Auth and PostgREST would otherwise turn every endpoint into a 500.
  const userId = userData.user.id;
  const { data: membership, error: membershipError } = await retryOnJwtSkew(
    () =>
      supabase
        .from("org_members")
        .select("org_id, orgs(timezone)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    (result) => result.error,
  );

  if (membershipError) throw membershipError;
  if (!membership) {
    throw new ApiError(403, "no_workspace", "Create a workspace before using the dashboard.");
  }

  const org = membership.orgs as unknown as { timezone: string } | null;
  return {
    supabase,
    userId,
    orgId: membership.org_id,
    timezone: org?.timezone ?? "Asia/Kolkata",
  };
}

/** PostgREST caps a response at its `max-rows` (1000 by default); page past it rather than silently truncate. */
const PAGE_SIZE = 1000;

/** Collects every page of a ranged query. `page` must apply a stable `order`. */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

/** The request body as JSON, or `undefined` when it is missing or malformed. */
export async function readJsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}

/** A 422 carrying the first validation issue. The schemas' messages are user-facing copy. */
export function validationError(error: ZodError): ApiError {
  return new ApiError(
    422,
    "validation_error",
    error.issues[0]?.message ?? "Check the highlighted fields and try again.",
  );
}

const STALE_WRITE_MESSAGE = "Someone else changed this account. Reload and try again.";

/**
 * The `If-Match` version token. Contract §3: every mutation carries the
 * resource's `updated_at`. A missing or unparseable token can only be stale.
 */
export function requireIfMatch(request: Request): string {
  const value = request.headers.get("if-match")?.trim().replace(/^W\//, "").replace(/^"|"$/g, "");
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new ApiError(409, "stale_write", STALE_WRITE_MESSAGE);
  }
  return value;
}

/**
 * RPC error codes (raised as `P0001` with the code as the message) and the
 * check violations a stale form could still trip, mapped to the contract's
 * statuses and copy.
 */
const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  stale_write: { status: 409, message: STALE_WRITE_MESSAGE },
  last_p0_required: {
    status: 409,
    message: "An account needs a P0 contact to be chased. Add a replacement first.",
  },
  escalation_order: { status: 422, message: "P2 must come after P1." },
  pause_reason_required: { status: 422, message: "Add a reason before pausing." },
  pause_until_past: {
    status: 422,
    message: "Pick a date in the future, or leave it blank to pause indefinitely.",
  },
  stop_reason_required: { status: 422, message: "Pick a reason before saving." },
  dnc_reason_required: {
    status: 422,
    message: "Add a reason before marking a contact do-not-contact.",
  },
  archive_name_mismatch: { status: 422, message: "That name doesn't match." },
  owner_not_member: { status: 422, message: "Pick an owner from this workspace." },
  forbidden: { status: 403, message: "Only workspace admins can change these settings." },
  account_archived: {
    status: 409,
    message: "This account is archived. Restore it to make changes.",
  },
  not_archived: { status: 409, message: "This account isn't archived." },
  not_found: { status: 404, message: "We couldn't find that account." },
  contact_not_found: { status: 404, message: "We couldn't find that contact." },
};

/** Maps a PostgREST/RPC error to an `ApiError`, or null when it is not one we expect. */
function fromRpcError(error: unknown): ApiError | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === "P0001" && typeof message === "string") {
    const known = RPC_ERRORS[message];
    if (known) return new ApiError(known.status, message, known.message);
  }
  // contacts_reachable: neither an email nor a phone number.
  if (code === "23514" && typeof message === "string" && message.includes("contacts_reachable")) {
    return new ApiError(422, "contact_unreachable", "Add an email address or a phone number.");
  }
  // reminder_recipients references the contact: it has chase history.
  if (code === "23503" && typeof message === "string" && message.includes("reminder_recipients")) {
    return new ApiError(
      409,
      "contact_in_use",
      "This contact has reminder history, so it can't be removed. Mark it do-not-contact instead.",
    );
  }
  return null;
}
