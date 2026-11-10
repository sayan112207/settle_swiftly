import { createServerFn } from "@tanstack/react-start";

import { getUserSupabase } from "@/lib/supabase/user-client.server";
import { joinWaitlistSchema } from "@/lib/schemas/waitlist";
import type { TablesInsert } from "@/lib/supabase/types.gen";

/**
 * Adds an email to the early-access waitlist.
 *
 * The table is write-only to the public (insert policy, no select), so this
 * runs with the anon-key client like any other visitor would. A repeat signup
 * hits the unique index on the normalised email; that is reported as success,
 * because from the visitor's side they are on the list either way.
 *
 * If the `company` column is not in the database yet (code deployed before
 * `db:push`), the signup is retried without it rather than lost.
 */
export const joinWaitlist = createServerFn({ method: "POST" })
  .validator(joinWaitlistSchema)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const supabase = getUserSupabase();
    const row: TablesInsert<"waitlist"> = { email: data.email, source: data.source ?? null };
    let { error } = await supabase
      .from("waitlist")
      .insert(data.company ? { ...row, company: data.company } : row);

    // PGRST204: PostgREST does not know the column (migration not applied yet).
    if (error?.code === "PGRST204" && data.company) {
      console.warn("[waitlist] company column missing; run db:push. Saving without it.");
      ({ error } = await supabase.from("waitlist").insert(row));
    }

    if (error && error.code !== "23505") {
      console.error("[waitlist] insert failed", error);
      return { ok: false, message: "That didn’t go through. Try again in a moment." };
    }
    return { ok: true };
  });
