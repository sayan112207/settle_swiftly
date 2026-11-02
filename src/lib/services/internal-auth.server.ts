/**
 * The gate in front of `/api/v1/internal/*`.
 *
 * These are the first routes in the codebase without a session: the caller is
 * Supabase Cron, by way of pg_net, holding a shared secret it read from Vault.
 * Anyone else who finds the URL can make the same request, so the secret is
 * the whole of the authentication and is compared accordingly.
 */

import { getCronSecret } from "@/lib/env.server";
import { ApiError } from "@/lib/services/api.server";

/**
 * Throws a 401 unless the request carries the cron secret as a bearer token.
 *
 * Called before anything else in the handler — before parsing a body, before
 * touching the database — so a wrong guess costs one hash and nothing more.
 *
 * A missing `CRON_SECRET` on the server is not a 401. `getCronSecret` throws a
 * plain error, which `handleApi` logs and answers with a 500: the deployment
 * is broken, and saying "unauthorized" would send someone to debug the
 * caller.
 */
export async function requireCronSecret(request: Request): Promise<void> {
  const expected = getCronSecret();
  const presented = bearerToken(request);
  if (presented === null || !(await secretsMatch(presented, expected))) {
    throw new ApiError(401, "unauthorized", "Missing or invalid credentials.");
  }
}

/** The token from `Authorization: Bearer …`, or null when there is none. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Compares two secrets in time that does not depend on where they differ.
 *
 * Both sides are hashed first, so the loop always runs over two 32-byte
 * digests: an early-exit `===` leaks how many leading characters were right,
 * and comparing raw strings of unequal length leaks the length. WebCrypto
 * rather than `node:crypto`'s `timingSafeEqual`, because it is the one API
 * present under Bun, Node and the Cloudflare runtime alike.
 */
export async function secretsMatch(presented: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** SHA-256 of a UTF-8 string. */
async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
