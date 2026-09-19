import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";

import { startGoogleOAuth } from "@/lib/services/auth.service";

/** Official Google mark, inlined — the CSP blocks off-host image requests. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

type Mode = "sign-in" | "sign-up";

type Props = {
  mode: Mode;
  /** Returns an error message, or null when the caller has already navigated. */
  onSubmit: (values: { email: string; password: string }) => Promise<string | null>;
  /** Rendered instead of the form once sign-up needs an email confirmation. */
  notice?: string | null;
  /** Pre-filled error, e.g. a failed OAuth round trip landing back here. */
  initialError?: string | null;
};

const copy = {
  "sign-in": {
    title: "Welcome back",
    subtitle: "Sign in to pick up where you left off.",
    submit: "Sign in",
    pending: "Signing in…",
    googleLabel: "Continue with Google",
    altPrompt: "New to Settle Swiftly?",
    altHref: "/signup",
    altLabel: "Create an account",
    autoComplete: "current-password",
  },
  "sign-up": {
    title: "Create your account",
    subtitle: "Start chasing invoices in a few minutes.",
    submit: "Create account",
    pending: "Creating your account…",
    googleLabel: "Sign up with Google",
    altPrompt: "Already have an account?",
    altHref: "/login",
    altLabel: "Sign in",
    autoComplete: "new-password",
  },
} as const;

/** The shared sign-in / sign-up card: Google button, email and password fields, and the link to the other mode. */
export function AuthForm({ mode, onSubmit, notice, initialError = null }: Props) {
  const t = copy[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const message = await onSubmit({ email, password });
      if (message) setError(message);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogle() {
    if (googlePending) return;
    setError(null);
    setGooglePending(true);
    try {
      const result = await startGoogleOAuth();
      if ("url" in result) {
        // Full navigation, not a router push: we are leaving the app for Google.
        window.location.assign(result.url);
        return;
      }
      setError(result.error);
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-[400px]">
        <Link
          to="/"
          className="mb-8 block text-center text-lg font-semibold tracking-tight text-ink"
        >
          Settle Swiftly
        </Link>

        <div className="rounded-[14px] border border-line bg-card p-7 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">{t.subtitle}</p>

          {notice ? (
            <p
              role="status"
              className="mt-6 rounded-[10px] border border-brand-line bg-brand-subtle px-4 py-3 text-sm text-brand-deep"
            >
              {notice}
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googlePending || pending}
                className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-line bg-background px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GoogleMark />
                {googlePending ? "Redirecting…" : t.googleLabel}
              </button>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs uppercase tracking-wide text-ink-muted">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={pending}
                    aria-invalid={!!error}
                    aria-describedby={error ? "auth-error" : undefined}
                    className="w-full rounded-[10px] border border-input bg-background px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:outline-none disabled:opacity-60"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={t.autoComplete}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={pending}
                      aria-invalid={!!error}
                      aria-describedby={error ? "auth-error" : undefined}
                      // extra right padding so the value never runs under the toggle
                      className="w-full rounded-[10px] border border-input bg-background py-2.5 pl-3.5 pr-11 text-sm text-ink focus-visible:border-brand focus-visible:outline-none disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={pending}
                      // The label carries the state, so screen readers announce
                      // the action rather than an unlabelled icon.
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      title={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-ink-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {showPassword ? (
                        <EyeOff className="size-[18px]" aria-hidden="true" />
                      ) : (
                        <Eye className="size-[18px]" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {mode === "sign-up" && (
                    <p className="mt-1.5 text-xs text-ink-muted">At least 8 characters.</p>
                  )}
                </div>

                {error && (
                  <p id="auth-error" role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pending || googlePending}
                  className="w-full rounded-[10px] bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {pending ? t.pending : t.submit}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-ink-secondary">
          {t.altPrompt}{" "}
          <Link to={t.altHref} className="font-medium text-brand-deep hover:underline">
            {t.altLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
