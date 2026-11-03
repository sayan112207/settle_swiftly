import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env.public";
import { getServiceRoleKey } from "@/lib/env.server";
import type { Database } from "./types.gen";

/**
 * Service-role Supabase client. **Bypasses every row-level security policy.**
 *
 * Legitimate uses are narrow: genuine system jobs with no signed-in user to
 * attribute the work to. Never use it to satisfy
 * a user-facing read — that discards the tenancy guarantees the schema is built
 * on and moves them into application code, where they get forgotten.
 *
 * Audit attribution: `auth.uid()` is null for service-role calls, so
 * `app.tg_audit()` records actor_id = NULL. It falls back to the
 * `app.actor_id` GUC — but that cannot be set from a separate supabase-js
 * call, because PostgREST gives every call its own transaction and the
 * setting would be gone before the next one runs. To attribute a background
 * write, do the `set_config('app.actor_id', …, true)` and the write inside a
 * single `public.*` RPC.
 */
export function getAdminSupabase(): SupabaseClient<Database> {
  return createClient<Database>(getPublicEnv().supabaseUrl, getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
