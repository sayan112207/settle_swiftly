import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { PermissionBanner, SettingsPanel } from "@/components/app/SettingsPanels";
import { PRODUCT_NAME } from "@/lib/brand";
import { buildSettingsView, SETTINGS_SECTIONS } from "@/lib/settings-view";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col gap-8 md:flex-row">
      <nav aria-label="Settings sections" className="md:w-[200px] md:shrink-0">
        <h1 className="mb-4 text-title font-bold tracking-tight text-fg">Settings</h1>
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {SETTINGS_SECTIONS.map((item) => {
            const active = item.id === section;
            return (
              <li key={item.id}>
                <Link
                  to="/app/settings"
                  search={{ section: item.id }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-body font-semibold transition-colors",
                    active ? "bg-alt text-fg" : "text-fg-soft hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 max-w-[900px] flex-1 space-y-6">
        {view.canEdit ? null : <PermissionBanner />}
        <SettingsPanel section={section} view={view} />
      </div>
    </div>
  );
}
