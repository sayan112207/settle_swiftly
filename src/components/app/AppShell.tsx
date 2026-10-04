import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { WORDMARK } from "@/lib/brand";
import { signOut } from "@/lib/services/auth.service";

/**
 * The product-app chrome: a 240px sticky sidebar beside the main region.
 *
 * Both root classes are load-bearing, not decorative:
 *
 * `app-shell` is where the token file hangs the focus-visible outline, tabular
 * numerals and the `row-action` hover/focus rule, so a screen rendered outside
 * this wrapper silently loses its accessibility floor.
 *
 * `app-theme` re-points `--accent`, which the landing palette maps to a neutral
 * hover grey and the app palette to brand green. Without it every accent
 * surface in the app — filled buttons, link-style buttons — renders pale grey.
 *
 * All eight nav items are present and navigable from this build. Only the
 * Dashboard has a real screen; the rest render a bare heading. They are not
 * disabled and not hidden — 21 later screens copy this nav, so it has to be
 * structurally complete now rather than grown one item at a time.
 */

const NAV_ITEMS = [
  { label: "Dashboard", to: "/app/dashboard" },
  { label: "Accounts", to: "/app/accounts" },
  { label: "Invoices", to: "/app/invoices" },
  { label: "Add entries", to: "/app/add-entries" },
  { label: "Payments", to: "/app/payments" },
  { label: "Chasing", to: "/app/chasing" },
  { label: "Reports", to: "/app/reports" },
  { label: "Settings", to: "/app/settings" },
] as const;

/**
 * Structural, not a copy of the auth service's `AuthedUser`. The shell needs
 * three display fields and should not care where identity came from.
 */
type ShellUser = {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

type AppShellProps = {
  user: ShellUser;
  orgName: string;
  children: ReactNode;
};

export function AppShell({ user, orgName, children }: AppShellProps) {
  // displayName is "" when the profile row is missing or hidden by RLS.
  const label = user.displayName || user.email || "";
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // Sign-out lived in the old /app header that this shell replaced. It has to
  // live here instead: the shell is the only chrome left, so dropping it would
  // leave the app with no way out of a session.
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      await navigate({ to: "/login" });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-theme app-shell flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-hairline bg-subtle px-4 py-5">
        {/* Spec asks for 17px; the type scale stops at 16px (text-section) and
            an arbitrary size is not permitted. */}
        <div className="px-2 pt-1.5 pb-6">
          <span className="text-section font-bold tracking-tight text-fg">{WORDMARK}</span>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              // Left padding lives in the active/inactive props rather than
              // here: two competing pl-* classes on one element resolve by
              // stylesheet order, not by the order they are written.
              className="rounded-r-nav border-l-2 py-2 pr-2 text-body font-semibold transition-colors duration-150 hover:bg-hovered"
              activeProps={{
                // pl-[10px] is the one arbitrary value permitted in this
                // codebase: 10px + the 2px accent edge lands the label on the
                // same 12px inset as an inactive item, and the spacing scale
                // has no 10px step. Do not copy this pattern elsewhere.
                className: "border-accent-line pl-[10px] text-fg",
                "aria-current": "page",
              }}
              inactiveProps={{
                // Transparent rather than absent, so the 2px edge is always in
                // the box and activation does not reflow the item.
                className: "border-transparent pl-3 text-fg-soft",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-hairline px-2 pt-2.5">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="size-8 shrink-0 rounded-pill"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-accent-tint text-pill font-semibold text-accent">
              {(label || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          {/* min-w-0 lets the truncation actually engage inside a flex row. */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-prose font-semibold text-fg">{label}</p>
            <p className="truncate text-eyebrow font-normal text-fg-muted" title={orgName}>
              {orgName}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            // An icon keeps the name readable in the reference's narrower
            // card; the label stays available to screen readers and on hover.
            aria-label={signingOut ? "Signing out…" : "Sign out"}
            title="Sign out"
            className="shrink-0 rounded-nav p-1.5 text-fg-muted transition-colors hover:bg-hovered hover:text-fg disabled:opacity-60"
          >
            <LogOut aria-hidden className="size-4" />
          </button>
        </div>
      </aside>

      {/* Spec asks for a 1400px cap and 28px of top padding; neither exists on
          the permitted scales, so this is the nearest step down at 1280/24px.
          min-w-0 is what lets the chase table's overflow-auto engage: a flex
          child defaults to min-width:auto, which would grow the page to the
          table's min-width instead of scrolling the table. */}
      <main className="max-w-7xl min-w-0 flex-1 bg-page px-8 pt-6 pb-10">
        {children}
        <Toaster />
      </main>
    </div>
  );
}
