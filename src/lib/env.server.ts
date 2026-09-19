/**
 * Server-only environment.
 *
 * Nothing here may carry a `VITE_` prefix — that prefix inlines a value into
 * the browser bundle, and the service-role key bypasses every row-level
 * security policy in the database.
 *
 * Read lazily rather than at module load: an eager throw would take down the
 * whole SSR render, including the marketing page, over a secret that only
 * server-side system jobs need. The failure still surfaces immediately, at the
 * first call that depends on it, with a message that names the variable.
 */

function readServerEnv(name: string): string | undefined {
  // `process` is absent on some edge runtimes; Nitro polyfills it for the
  // Cloudflare target, but guard rather than assume.
  if (typeof process === "undefined") return undefined;
  const value = process.env[name];
  return value !== undefined && value !== "" ? value : undefined;
}

function requireServerEnv(name: string): string {
  const value = readServerEnv(name);
  if (value === undefined) {
    throw new Error(
      `Missing required server environment variable ${name}. ` +
        `Set it in .env for local development (see .env.example), or in the ` +
        `host's encrypted secrets in production. Never prefix it with VITE_.`,
    );
  }
  return value;
}

/** Bypasses all RLS. Only for paths with no signed-in user, e.g. system jobs. */
export function getServiceRoleKey(): string {
  return requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}
