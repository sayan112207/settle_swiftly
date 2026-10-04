import { useEffect, useRef, useState } from "react";
import { ComingSoonNotification } from "@/components/app/ComingSoonNotification";

interface PaymentTriageTabsProps {
  totalPayments: number;
}

type TabId = "confident" | "needs_review" | "unmatched";

/** Payment categorization tabs for filtering by confidence level. Backend categorization logic is coming soon, so tabs show no counts. */
export function PaymentTriageTabs({ totalPayments }: PaymentTriageTabsProps) {
  const [selectedTab, setSelectedTab] = useState<TabId>("confident");
  const [showComingSoon, setShowComingSoon] = useState(false);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    },
    [],
  );

  // No per-tab counts: the backend doesn't categorise payments yet, and a
  // hard-coded 0 would read as a real number.
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "confident", label: "Confident" },
    { id: "needs_review", label: "Needs review" },
    { id: "unmatched", label: "Unmatched" },
  ];

  const handleTabClick = (tabId: TabId) => {
    setSelectedTab(tabId);
    setShowComingSoon(true);
    if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setShowComingSoon(false), 3000);
  };

  return (
    <div className="space-y-3">
      {/* Tab list with semantic role */}
      <div role="tablist" className="flex gap-7 border-b border-hairline pb-0">
        {tabs.map((tab) => {
          const isSelected = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleTabClick(tab.id)}
              className={`px-0 py-3 border-b-2 text-body font-semibold transition-colors flex items-center gap-2 ${
                isSelected
                  ? "border-b-accent text-fg"
                  : "border-b-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="text-prose text-fg-muted">J/K to move · Enter to allocate</p>

      {/* Coming soon message */}
      {showComingSoon && (
        <ComingSoonNotification
          message="Payment categorization is coming soon — backend support is being added."
          variant="inline"
        />
      )}
    </div>
  );
}
