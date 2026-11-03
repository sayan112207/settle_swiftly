import { z } from "zod";

/**
 * Public environment.
 *
 * The `VITE_` prefix means Vite inlines these into the browser bundle at build
 * time, so everything here is public by definition. The anon key is *designed*
 * to ship to browsers — every request it makes is still gated by RLS.
 *
 * Secrets live in `env.server.ts` and must never be imported from here.
 *
 * Validated on first use rather than at module load, for the same reason as the
 * server env: a missing `.env` should fail the Supabase call that needs it, not
 * take down server-side rendering of a marketing page that needs no database at
 * all.
 */
const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a full URL"),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, "VITE_SUPABASE_ANON_KEY looks truncated"),
  /**
   * Serve the product app from fixtures instead of the API.
   *
   * Spelled out rather than coerced: `Boolean("false")` is `true`, and a flag
   * that silently means the opposite of what it reads is worse than absent.
   * Anything other than "true"/"false" is a typo and should fail loudly.
   */
  VITE_USE_MOCKS: z
    .enum(["true", "false"], {
      errorMap: () => ({ message: 'VITE_USE_MOCKS must be exactly "true" or "false"' }),
    })
    .optional()
    .default("false"),
  /**
   * Accounts-only override. The dashboard has a real `/api/v1` backend; the
   * accounts endpoints do not yet, so their screens can stay on fixtures while
   * the dashboard talks to the API. Unset means "same as VITE_USE_MOCKS".
   */
  VITE_USE_ACCOUNTS_MOCKS: z
    .enum(["true", "false"], {
      errorMap: () => ({ message: 'VITE_USE_ACCOUNTS_MOCKS must be exactly "true" or "false"' }),
    })
    .optional(),
});

export type PublicEnv = {
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly useMocks: boolean;
  readonly useAccountsMocks: boolean;
};

let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cached) return cached;

  const parsed = publicEnvSchema.safeParse({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_USE_MOCKS: import.meta.env.VITE_USE_MOCKS,
    VITE_USE_ACCOUNTS_MOCKS: import.meta.env.VITE_USE_ACCOUNTS_MOCKS,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment. Copy .env.example to .env and fill it in.\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }

  cached = {
    supabaseUrl: parsed.data.VITE_SUPABASE_URL,
    supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
    useMocks: parsed.data.VITE_USE_MOCKS === "true",
    useAccountsMocks:
      (parsed.data.VITE_USE_ACCOUNTS_MOCKS ?? parsed.data.VITE_USE_MOCKS) === "true",
  };
  return cached;
}
