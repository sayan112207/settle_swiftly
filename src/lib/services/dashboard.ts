import { z } from "zod";

import { getPublicEnv } from "@/lib/env.public";
import {
  apiErrorSchema,
  chaseQueueSchema,
  chaseResponseSchema,
  dashboardSummarySchema,
  type ChaseQueue,
  type ChaseResponse,
  type DashboardSummary,
} from "@/lib/schemas/dashboard";
import {
  chaseQueueFixture,
  makeChaseResponseFixture,
  summaryFixture,
} from "@/lib/services/dashboard.mocks";

/**
 * Dashboard data access. Components call these; they never call `fetch`.
 *
 * Both the mock and the network path end at the same `schema.parse(...)`. That
 * is the point: a fixture that drifts from the contract breaks in development
 * exactly the way a bad payload would break in production, so mocks cannot
 * quietly encode a shape the backend will never send.
 *
 * Unlike the auth and orgs services these are plain async functions
 * rather than `createServerFn` handlers. Those wrap Supabase and need the
 * server-only client; this API needs no secret, and the mock delay only makes
 * sense on the client where the loading states actually render.
 */

/** Shared with the Dashboard so invalidation and fetch use the same keys. */
export const dashboardQueryKeys = {
  summary: ["dashboard", "summary"] as const,
  chaseQueue: ["dashboard", "chase-queue"] as const,
};

const API_BASE_PATH = "/api/v1";

/** Long enough that a skeleton is visible and a layout shift would be obvious. */
const MOCK_DELAY_MS = 400;

/**
 * Hung-request cap. Not a contract value — the API does not name one — so a
 * caller that passes its own `signal` keeps control. Without this, a stalled
 * `/api/v1` leaves the loading skeletons up forever.
 */
const FETCH_TIMEOUT_MS = 15_000;

/** Contract: `limit` defaults to 6, max 50. */
const DEFAULT_CHASE_QUEUE_LIMIT = 6;
const chaseQueueLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(50, "chase-queue limit is capped at 50 by the API contract");

const chaseRequestSchema = z
  .array(z.string().uuid())
  .min(1, "Chase at least one invoice — an empty request is a UI bug, not a no-op");

/**
 * A 4xx/5xx that arrived in the contract's error envelope.
 *
 * `message` is the backend's user-facing copy and is safe to render verbatim;
 * that is the whole reason this class exists rather than a bare `Error`.
 */
export class DashboardApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DashboardApiError";
    this.code = code;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs the request and hands back the decoded body, or throws.
 *
 * Returns `unknown` on purpose — the caller must run it through a schema. A
 * generic that returned `T` here would let a caller skip validation and still
 * typecheck, which is the failure this module is built to prevent.
 */
async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // A body is expected on both success and failure; the contract defines an
  // envelope for errors too. Anything unparseable is handled below.
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new DashboardApiError(parsed.data.error.code, parsed.data.error.message);
    }
    // No envelope means the API broke its own contract. There is no backend
    // copy to show, so this message is for the developer reading the console and
    // the UI falls back to its own generic error state. Logged here rather than
    // left to the caller: the screens deliberately never render this string, so
    // an unlogged throw would lose the status and path that explain the failure.
    const contractError = new Error(
      `${path} failed with ${response.status} and no error envelope. Check the API contract.`,
    );
    console.error(contractError);
    throw contractError;
  }

  return body;
}

/** `GET /api/v1/dashboard/summary` */
export async function getSummary(): Promise<DashboardSummary> {
  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    return dashboardSummarySchema.parse(summaryFixture);
  }

  const body = await requestJson("/dashboard/summary", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return dashboardSummarySchema.parse(body);
}

/** `GET /api/v1/dashboard/chase-queue?limit=6` */
export async function getChaseQueue(
  limit: number = DEFAULT_CHASE_QUEUE_LIMIT,
): Promise<ChaseQueue> {
  const safeLimit = chaseQueueLimitSchema.parse(limit);

  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    // Sliced rather than returned whole so a caller asking for fewer rows sees
    // fewer rows, as it would against the real endpoint.
    const parsed = chaseQueueSchema.parse(chaseQueueFixture);
    return { total_eligible: parsed.total_eligible, items: parsed.items.slice(0, safeLimit) };
  }

  const body = await requestJson(`/dashboard/chase-queue?limit=${safeLimit}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return chaseQueueSchema.parse(body);
}

/**
 * `POST /api/v1/chases`
 *
 * The server re-validates every invoice, so the reply can contain `skipped`
 * entries even for rows the queue just returned — an invoice can be paid or
 * disputed between page load and click. Callers must render `skipped`.
 */
export async function postChases(invoiceIds: readonly string[]): Promise<ChaseResponse> {
  const ids = chaseRequestSchema.parse(invoiceIds);

  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    return chaseResponseSchema.parse(makeChaseResponseFixture(ids));
  }

  const body = await requestJson("/chases", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_ids: ids }),
  });
  return chaseResponseSchema.parse(body);
}
