import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { signInWithPassword } from "@/lib/services/auth.service";
import { signInSchema } from "@/lib/schemas/auth.schema";

/** Set by /auth/callback when the Google handshake doesn't complete. */
const OAUTH_REASONS: Record<string, string> = {
  "oauth-cancelled": "Google sign-in was cancelled. You can try again or use your password.",
  "oauth-missing-code": "That Google sign-in didn't complete. Please try again.",
  "oauth-failed": "We couldn't finish signing you in with Google. Please try again.",
};

export const Route = createFileRoute("/login")({
  // The key is omitted rather than set to `undefined` on purpose: under
  // `exactOptionalPropertyTypes`, returning `{ reason: undefined }` would type
  // as a required property and force every `<Link to="/login">` in the app to
  // pass a search object.
  validateSearch: (search: Record<string, unknown>): { reason?: string } =>
    typeof search["reason"] === "string" ? { reason: search["reason"] } : {},
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Settle Swiftly" }] }),
});

function LoginPage() {
  const { reason } = Route.useSearch();
  const navigate = useNavigate();
  const oauthMessage = reason ? OAUTH_REASONS[reason] : undefined;

  return (
    <AuthForm
      mode="sign-in"
      initialError={oauthMessage ?? null}
      onSubmit={async (values) => {
        const parsed = signInSchema.safeParse(values);
        if (!parsed.success) {
          return parsed.error.issues[0]?.message ?? "Check your details and try again.";
        }

        const result = await signInWithPassword({ data: parsed.data });
        if (result.status === "error") return result.message;

        // /app decides where they actually land — it bounces to /onboarding
        // when the account has no org yet.
        await navigate({ to: "/app" });
        return null;
      }}
    />
  );
}
