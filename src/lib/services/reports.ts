import { apiErrorSchema } from "@/lib/schemas/dashboard";
import { weeklyReportSchema, type WeeklyReport } from "@/lib/schemas/reports";
import { getPublicEnv } from "@/lib/env.public";
import { weeklyReportFixture } from "@/lib/services/reports.mocks";

/**
 * Reports data access. The page calls this; it never calls `fetch`.
 *
 * Mirrors `dashboard.ts`: the mock and network paths end at the same
 * `schema.parse(...)`, so a fixture that drifts from the contract fails in
 * development exactly where a bad payload would fail in production.
 */

/** Shared with the page so invalidation and fetch use the same key. */
export const reportsQueryKeys = {
  weekly: ["reports", "weekly"] as const,
};

const API_BASE_PATH = "/api/v1";

/** Long enough that a skeleton is visible and a layout shift would be obvious. */
const MOCK_DELAY_MS = 400;

/** Hung-request cap, so a stalled API cannot leave skeletons up forever. */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * A 4xx/5xx that arrived in the contract's error envelope. `message` is the
 * backend's user-facing copy and is safe to render verbatim.
 */
export class ReportsApiError extends Error {
  readonly code: string;

  /** Carries the envelope's code alongside its user-facing message. */
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReportsApiError";
    this.code = code;
  }
}

/** The code for an endpoint that isn't built yet; the page hides Retry for it. */
export const REPORTS_NOT_AVAILABLE = "not_available";

/** Stands in for a body that said it was JSON but didn't parse. */
const NOT_JSON = Symbol("not-json");

/** Resolves after `ms`; only the mock path uses it. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs the request and hands back the decoded body, or throws.
 *
 * Returns `unknown` on purpose — the caller must run it through a schema.
 */
async function requestJson(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // Until the endpoint ships, a 404 or a 2xx that isn't JSON (the host's HTML
  // fallback) means "not built yet" rather than "broken", so the page can say
  // so. A 5xx still goes through the error handling below.
  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  if (response.status === 404 || (response.ok && !isJson)) {
    throw new ReportsApiError(REPORTS_NOT_AVAILABLE, "Reports are coming soon.");
  }

  const body: unknown = await response.json().catch(() => NOT_JSON);
  if (response.ok && body === NOT_JSON) {
    throw new ReportsApiError(REPORTS_NOT_AVAILABLE, "Reports are coming soon.");
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ReportsApiError(parsed.data.error.code, parsed.data.error.message);
    }
    // No envelope: the message is for the developer, and the screen shows its
    // own copy instead. Logged here because the screen never renders it.
    const contractError = new Error(
      `${path} failed with ${response.status} and no error envelope. Check the API contract.`,
    );
    console.error(contractError);
    throw contractError;
  }

  return body;
}

/** `GET /api/v1/reports/weekly` */
export async function getWeeklyReport(): Promise<WeeklyReport> {
  if (getPublicEnv().useMocks) {
    await delay(MOCK_DELAY_MS);
    return weeklyReportSchema.parse(weeklyReportFixture);
  }

  const body = await requestJson("/reports/weekly", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return weeklyReportSchema.parse(body);
}
