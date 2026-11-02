import { apiErrorSchema } from "@/lib/schemas/dashboard";

/**
 * Shared request plumbing for features whose `/api/v1` endpoints are being
 * built behind the screens: Legal escalation, Matters, and Commercial terms.
 *
 * Mirrors `reports.ts` exactly — the same three "not built yet" signals, the
 * same envelope handling — so these screens degrade the way Reports already
 * does: a page whose endpoint is missing says it is coming soon, rather than
 * showing an error that suggests something broke.
 *
 * Returns `unknown` on purpose. Every caller runs the body through a zod
 * schema, so a payload that drifts from the contract fails at the boundary.
 */

const API_BASE_PATH = "/api/v1";

/** Hung-request cap, so a stalled API cannot leave skeletons up forever. */
const FETCH_TIMEOUT_MS = 15_000;

/** The code for an endpoint that isn't built yet; screens hide Retry for it. */
export const NOT_AVAILABLE = "not_available";

/**
 * A 4xx/5xx that arrived in the contract's error envelope, or a "not built
 * yet" signal. `message` is user-facing and safe to render verbatim.
 */
export class FeatureApiError extends Error {
  readonly code: string;

  /** Carries the envelope's code alongside its user-facing message. */
  constructor(code: string, message: string) {
    super(message);
    this.name = "FeatureApiError";
    this.code = code;
  }
}

/** Stands in for a body that said it was JSON but didn't parse. */
const NOT_JSON = Symbol("not-json");

/**
 * Performs one request against `/api/v1` and hands back the decoded body.
 *
 * `comingSoon` is the copy shown while the endpoint does not exist yet — each
 * feature words it for its own screen.
 */
export async function featureRequest(
  path: string,
  init: RequestInit,
  comingSoon: string,
): Promise<unknown> {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  if (response.status === 404 || (response.ok && !isJson)) {
    throw new FeatureApiError(NOT_AVAILABLE, comingSoon);
  }

  const body: unknown = await response.json().catch(() => NOT_JSON);
  if (response.ok && body === NOT_JSON) {
    throw new FeatureApiError(NOT_AVAILABLE, comingSoon);
  }
  // With no server route for the path, the framework answers with a bare
  // {"error": "..."} string rather than our envelope: that is "not built yet".
  if (
    !response.ok &&
    typeof body === "object" &&
    body !== null &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    throw new FeatureApiError(NOT_AVAILABLE, comingSoon);
  }

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new FeatureApiError(parsed.data.error.code, parsed.data.error.message);
    }
    const contractError = new Error(
      `${path} failed with ${response.status} and no error envelope. Check the API contract.`,
    );
    console.error(contractError);
    throw contractError;
  }

  return body;
}

/** A JSON write: same handling as a read, with the body serialised. */
export function featureWrite(
  path: string,
  method: "POST" | "PUT" | "PATCH",
  payload: unknown,
  comingSoon: string,
): Promise<unknown> {
  return featureRequest(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    comingSoon,
  );
}

/** Resolves after `ms`; only the mock paths use it. */
export function mockDelay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The copy a person sees for a failed request: the API's own, or the screen's. */
export function featureErrorMessage(error: unknown, fallback: string): string {
  return error instanceof FeatureApiError ? error.message : fallback;
}

/** Whether Retry can help: not for an endpoint that isn't built yet. */
export function isFeatureRetryable(error: unknown): boolean {
  return !(error instanceof FeatureApiError && error.code === NOT_AVAILABLE);
}
