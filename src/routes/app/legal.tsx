import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { KeyboardEvent } from "react";

import { PRODUCT_NAME } from "@/lib/brand";
import { getEligible, getMatters, legalQueryKeys } from "@/lib/services/legal";

export const Route = createFileRoute("/app/legal")({
  head: () => ({ meta: [{ title: `Legal escalation — ${PRODUCT_NAME}` }] }),
  component: LegalLayout,
});

/** Tab classes, matching the Chasing section's tabs. */
function tabClass(active: boolean): string {
  return `border-b-2 pb-3 text-body font-semibold ${
    active ? "border-accent-line text-fg" : "border-transparent text-fg-soft hover:text-fg"
  }`;
}

/**
 * Legal escalation: the eligible list and the matters list share a header and
 * tabs. The recovery ladder, advocate list, review and matter record are
 * steps inside one decision, so they carry their own back links instead.
 */
function LegalLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onEligible = pathname === "/app/legal" || pathname === "/app/legal/";
  const onMatters = pathname === "/app/legal/matters" || pathname === "/app/legal/matters/";

  /** Arrow keys move between the two section tabs, matching the tab pattern. */
  function onTabsKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const tabs = [
      { to: "/app/legal" as const, id: "legal-tab-eligible" },
      { to: "/app/legal/matters" as const, id: "legal-tab-matters" },
    ];
    const current = onMatters ? 1 : 0;
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next]!;
    void navigate({ to: tab.to }).then(() => document.getElementById(tab.id)?.focus());
  }

  // Counts for the tab labels. The same keys as the pages, so no extra fetch.
  const eligibleQuery = useQuery({
    queryKey: legalQueryKeys.eligible,
    queryFn: () => getEligible(),
    retry: false,
    enabled: onEligible || onMatters,
  });
  const mattersQuery = useQuery({
    queryKey: legalQueryKeys.matters,
    queryFn: () => getMatters(),
    retry: false,
    enabled: onEligible || onMatters,
  });

  if (!onEligible && !onMatters) return <Outlet />;

  const eligibleCount = eligibleQuery.data?.items.length;
  const mattersCount = mattersQuery.data?.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title font-bold tracking-tight text-fg">Legal escalation</h1>
        <p className="mt-1 text-prose text-fg-soft">
          For invoices that reminders couldn&apos;t recover.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Legal sections"
        className="flex gap-7 border-b border-hairline"
        onKeyDown={onTabsKeyDown}
      >
        <Link
          id="legal-tab-eligible"
          to="/app/legal"
          role="tab"
          aria-selected={onEligible}
          tabIndex={onEligible ? 0 : -1}
          className={tabClass(onEligible)}
        >
          Eligible{eligibleCount === undefined ? "" : ` (${eligibleCount})`}
        </Link>
        <Link
          id="legal-tab-matters"
          to="/app/legal/matters"
          role="tab"
          aria-selected={onMatters}
          tabIndex={onMatters ? 0 : -1}
          className={tabClass(onMatters)}
        >
          Matters{mattersCount === undefined ? "" : ` (${mattersCount})`}
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
