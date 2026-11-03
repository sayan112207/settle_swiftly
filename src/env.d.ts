/// <reference types="vite/client" />

/**
 * Public environment. The `VITE_` prefix means Vite inlines these into the
 * browser bundle at build time — so everything declared here is public by
 * definition. Secrets are read server-side only, via `@/lib/env.server`.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /**
   * Optional, and a plain string here: `env.public.ts` is what narrows it to
   * exactly "true" or "false". Absent means mocks off.
   */
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_USE_ACCOUNTS_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
