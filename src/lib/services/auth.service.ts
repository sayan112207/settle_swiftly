import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";

import { retryOnJwtSkew } from "@/lib/supabase/jwt-skew-retry";
import { getUserSupabase } from "@/lib/supabase/user-client.server";
import { signInSchema, signUpSchema } from "@/lib/schemas/auth.schema";

export type AuthedUser = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type OrgSummary = { id: string; name: string; role: string };

export type AuthContext = {
  user: AuthedUser | null;
  orgs: OrgSummary[];
};

/** Generic on purpose — never reveal whether an address has an account. */
const GENERIC_CREDENTIALS_ERROR = "That email and password combination didn't work.";

export type AuthResult =
  { status: "signed-in" } | { status: "confirm-email" } | { status: "error"; message: string };

/**
 * Who is signed in, and which orgs they belong to.
 *
 * Reads through the user-scoped client, so RLS decides what comes back — the
 * org list is whatever `org_members` will actually show this user, not a
 * hand-filtered query.
 */
export const getAuthContext = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthContext> => {
    const supabase = getUserSupabase();

    // getUser() revalidates the JWT with the auth server; getSession() would
    // trust a cookie the client controls.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return { user: null, orgs: [] };

    const authUser = userData.user;

    const loadProfileAndMemberships = () =>
      Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", authUser.id)
          .maybeSingle(),
        // RLS lets a member see every teammate's membership row, so without the
        // user_id filter an org comes back once per member, carrying their role.
        // RLS is still the security boundary; this only picks the caller's rows.
        // Oldest first: orgs[0] is the org the shell shows, and the dashboard
        // API resolves the same one.
        supabase
          .from("org_members")
          .select("role, orgs(id, name)")
          .eq("user_id", authUser.id)
          .order("created_at", { ascending: true }),
      ]);

    // Retried once on PGRST303 (JWT issued at future): the membership query is
    // the first PostgREST call after an OAuth sign-in, where clock drift bites.
    const [{ data: profile }, { data: memberships, error: membershipsError }] =
      await retryOnJwtSkew(loadProfileAndMemberships, ([, m]) => m.error);

    // A failed query is not the same as "belongs to no orgs". Silently
    // returning an empty list would send an existing user to /onboarding and
    // invite them to create a second workspace. Fail loudly instead — the
    // route guard surfaces it rather than acting on a wrong answer.
    if (membershipsError) {
      console.error("[auth] could not load org memberships", membershipsError);
      throw new Error("Could not load your workspaces. Please try again.");
    }

    const orgs: OrgSummary[] = (memberships ?? []).flatMap((m) => {
      // The embedded relation is an object for a to-one join, but be defensive:
      // a null here means RLS hid the org row, and that is not an org we can show.
      const org = m.orgs as unknown as { id: string; name: string } | null;
      return org ? [{ id: org.id, name: org.name, role: m.role }] : [];
    });

    return {
      user: {
        id: authUser.id,
        email: authUser.email ?? null,
        displayName: profile?.display_name ?? "",
        avatarUrl: profile?.avatar_url ?? null,
      },
      orgs,
    };
  },
);

export const signUpWithPassword = createServerFn({ method: "POST" })
  .validator(signUpSchema)
  .handler(async ({ data }): Promise<AuthResult> => {
    const supabase = getUserSupabase();
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (error) {
      // Log the provider's own wording; return only messages we have chosen.
      // Passing `error.message` straight through would surface internal auth
      // detail to anyone probing the form.
      console.error("[auth] sign-up failed", { code: error.code, message: error.message });

      // These two are safe to name and actionable — anything else is generic.
      // "over_email_send_rate_limit" in particular looks like an app bug when
      // reported as a generic failure, and the fix is a project setting.
      if (error.code === "over_email_send_rate_limit") {
        return {
          status: "error",
          message: "Too many sign-up emails just now. Please try again in a little while.",
        };
      }
      if (error.code === "email_address_invalid") {
        return { status: "error", message: "That email address isn't accepted." };
      }
      if (error.code === "weak_password") {
        return { status: "error", message: "Choose a stronger password." };
      }
      return { status: "error", message: "Couldn't create your account. Please try again." };
    }

    // With "Confirm email" enabled (the Supabase default) signUp returns a user
    // but no session — the account is not usable until the link is clicked.
    return result.session ? { status: "signed-in" } : { status: "confirm-email" };
  });

export const signInWithPassword = createServerFn({ method: "POST" })
  .validator(signInSchema)
  .handler(async ({ data }): Promise<AuthResult> => {
    const supabase = getUserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      // Keep the real reason in the server log — the client deliberately only
      // ever sees the generic message below, which makes misconfiguration
      // (rate limits, provider disabled) otherwise invisible to diagnose.
      console.error("[auth] sign-in failed", { code: error.code, message: error.message });

      // Supabase distinguishes "invalid credentials" from "email not confirmed".
      // The second is safe and actionable to surface; anything else collapses to
      // one generic message so the form cannot be used to enumerate accounts.
      if (error.code === "email_not_confirmed") {
        return {
          status: "error",
          message: "Confirm your email address first — check your inbox for the link.",
        };
      }
      return { status: "error", message: GENERIC_CREDENTIALS_ERROR };
    }

    return { status: "signed-in" };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = getUserSupabase();
  await supabase.auth.signOut();
  return { ok: true as const };
});

/**
 * Begins the Google OAuth handshake.
 *
 * `skipBrowserRedirect` keeps Supabase from trying to navigate on the server;
 * we hand the URL back and let the browser go there. The PKCE code verifier is
 * written to a cookie by the server client here, and read again by
 * `completeOAuth` — which is why both halves must run server-side.
 */
export const startGoogleOAuth = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ url: string } | { error: string }> => {
    const supabase = getUserSupabase();
    const origin = new URL(getRequestUrl()).origin;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error || !data.url) {
      return { error: error?.message ?? "Could not start Google sign-in." };
    }
    return { url: data.url };
  },
);

/** Exchanges the `?code=` from Google's redirect for a session cookie. */
export const completeOAuth = createServerFn({ method: "POST" })
  .validator(z.object({ code: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const supabase = getUserSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(data.code);
    if (error) {
      console.error("[auth] oauth code exchange failed", error);
      return { ok: false, message: "That sign-in link didn't work. Please try again." };
    }
    return { ok: true };
  });
