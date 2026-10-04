import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { PermissionBanner, SettingsPanel } from "@/components/app/SettingsPanels";
import { PRODUCT_NAME } from "@/lib/brand";
import { buildSettingsView, SETTINGS_SECTIONS } from "@/lib/settings-view";

const settingsSearchSchema = z.object({
  section: z.enum(SETTINGS_SECTIONS.map((s) => s.id) as [string, ...string[]]).optional(),
});

/**
 * Org-level settings. Everything shown comes from the signed-in user and org
 * already on the route context; sections without a backend say "coming soon".
 * The active section lives in the URL so it can be linked to and Back works.
 */
export const Route = createFileRoute("/app/settings")({
  validateSearch: settingsSearchSchema,
  head: () => ({ meta: [{ title: `Settings — ${PRODUCT_NAME}` }] }),
  component: SettingsPage,
});

/** Sub-nav on the left, the active section's panel on the right. */
function SettingsPage() {
  const { user, orgs } = Route.useRouteContext();
  const { section = "sending" } = Route.useSearch();
  // `/app` guarantees a user and at least one org before this renders.
  const view = buildSettingsView(user, orgs[0]!);

  return (
    // The sub-nav is a full-height column flush against the app sidebar, as in
    // the reference, so it steps out of <main>'s padding on the left and top.
    <div className="flex flex-col gap-6 md:-mt-6 md:-mb-10 md:-ml-8 md:min-h-screen md:flex-row md:gap-0">
      <nav
        aria-label="Settings sections"
        className="md:w-[200px] md:shrink-0 md:border-r md:border-hairline md:px-3 md:pt-7"
      >
        <h1 className="mb-3.5 px-2 text-section font-bold tracking-tight text-fg">Settings</h1>
        <ul className="flex flex-wrap gap-0.5 md:flex-col">
          {SETTINGS_SECTIONS.map((item) => {
            const active = item.id === section;
            // Plain strings, not cn(): tailwind-merge reads `text-body` as a
            // colour and would drop it next to `text-fg`.
            const state = active ? "bg-alt text-fg" : "text-fg-soft hover:text-fg";
            return (
              <li key={item.id}>
                <Link
                  to="/app/settings"
                  search={{ section: item.id }}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-lg p-2 text-body font-semibold transition-colors ${state}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 max-w-[900px] flex-1 space-y-6 md:pt-7 md:pl-10">
        {view.canEdit ? null : <PermissionBanner />}
        <SettingsPanel section={section} view={view} />
      </div>
    </div>
  );
}
