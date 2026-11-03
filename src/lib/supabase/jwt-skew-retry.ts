/**
 * PGRST303 "JWT issued at future": a token minted moments ago by Supabase Auth
 * can be rejected by PostgREST when their clocks drift by a second or two —
 * typically on the first requests right after an OAuth sign-in. It clears on
 * its own, so the fix is to wait briefly and try once more, not to fail the
 * request.
 */

/** How long to wait before the single retry. Comfortably longer than the drift seen in practice. */
export const JWT_SKEW_RETRY_MS = 2000;

/** True for PostgREST's "JWT issued at future" rejection. */
export function isJwtIssuedAtFuture(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST303";
}

/**
 * Runs `run`, and if `errorOf` reports a JWT-skew rejection, waits and runs it
 * exactly once more. Any other outcome — success or a different error — is
 * returned untouched, so callers keep their own error handling. `delayMs` is
 * only overridden by tests.
 */
export async function retryOnJwtSkew<T>(
  run: () => PromiseLike<T>,
  errorOf: (result: T) => { code?: string } | null | undefined,
  delayMs: number = JWT_SKEW_RETRY_MS,
): Promise<T> {
  const first = await run();
  if (!isJwtIssuedAtFuture(errorOf(first))) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return run();
}
