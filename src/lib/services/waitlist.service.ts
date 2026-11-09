import { createServerFn } from "@tanstack/react-start";

import { getUserSupabase } from "@/lib/supabase/user-client.server";
import { joinWaitlistSchema } from "@/lib/schemas/waitlist";

/**
 * Adds an email to the early-access waitlist.
 *
 * The table is write-only to the public (insert policy, no select), so this
 * runs with the anon-key client like any other visitor would. A repeat signup
 * hits the unique index on the normalised email; that is reported as success,
 * because from the visitor's side they are on the list either way.
 */
export const joinWaitlist = createServerFn({ method: "POST" })
  .validator(joinWaitlistSchema)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const supabase = getUserSupabase();
    const { error } = await supabase
      .from("waitlist")
      .insert({ email: data.email, source: data.source ?? null });

    if (error && error.code !== "23505") {
      console.error("[waitlist] insert failed", error);
      return { ok: false, message: "That didn’t go through. Try again in a moment." };
    }
    return { ok: true };
  });
