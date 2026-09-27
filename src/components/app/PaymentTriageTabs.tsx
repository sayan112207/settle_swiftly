import { useState } from "react";
import { ComingSoonNotification } from "@/components/app/ComingSoonNotification";

interface PaymentTriageTabsProps {
  totalPayments: number;
}

type TabId = "confident" | "needs_review" | "unmatched";

/** Payment categorization tabs for filtering by confidence level. Backend categorization logic is coming soon; shows placeholder counts. */
export function PaymentTriageTabs({ totalPayments }: PaymentTriageTabsProps) {
  const [selectedTab, setSelectedTab] = useState<TabId>("confident");
  const [showComingSoon, setShowComingSoon] = useState(false);

  const tabs: Array<{
    id: TabId;
    label: string;
    count: number;
  }> = [
    { id: "confident", label: "Confident", count: 0 },
    { id: "needs_review", label: "Needs review", count: 0 },
    { id: "unmatched", label: "Unmatched", count: 0 },
  ];

  const handleTabClick = (tabId: TabId) => {
    setSelectedTab(tabId);
    setShowComingSoon(true);
    const timer = setTimeout(() => setShowComingSoon(false), 3000);
    return () => clearTimeout(timer);
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
              <span
                className={`text-prose font-semibold px-2 py-0.5 rounded-full ${
                  isSelected ? "bg-accent-tint text-accent" : "bg-subtle text-fg-muted"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

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
