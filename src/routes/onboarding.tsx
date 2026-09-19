import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { getAuthContext } from "@/lib/services/auth.service";
import { createOrg } from "@/lib/services/orgs.service";
import { createOrgSchema } from "@/lib/schemas/auth.schema";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up your workspace — Settle Swiftly" }] }),
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (!ctx.user) throw redirect({ to: "/login" });
    // Already set up — nothing to onboard.
    if (ctx.orgs.length > 0) throw redirect({ to: "/app" });
    return { displayName: ctx.user.displayName };
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { displayName } = Route.useRouteContext();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const firstName = displayName.split(" ")[0] ?? "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;

    const parsed = createOrgSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give your business a name.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      const result = await createOrg({ data: parsed.data });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await navigate({ to: "/app" });
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="rounded-[14px] border border-line bg-card p-7 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            {firstName ? `Welcome, ${firstName}.` : "Welcome."}
          </h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            What's your business called? This is the name your customers will see on reminders.
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor="org-name" className="mb-1.5 block text-sm font-medium text-ink">
                Business name
              </label>
              <input
                id="org-name"
                type="text"
                autoComplete="organization"
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                aria-invalid={!!error}
                aria-describedby={error ? "org-error" : undefined}
                placeholder="Northline Creative"
                className="w-full rounded-[10px] border border-input bg-background px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus-visible:border-brand focus-visible:outline-none disabled:opacity-60"
              />
            </div>

            {error && (
              <p id="org-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-[10px] bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-70"
            >
              {pending ? "Setting up…" : "Continue"}
            </button>
          </form>

          <p className="mt-4 text-xs text-ink-muted">
            You can rename this later. Everything you add lives inside this workspace.
          </p>
        </div>
      </div>
    </main>
  );
}
