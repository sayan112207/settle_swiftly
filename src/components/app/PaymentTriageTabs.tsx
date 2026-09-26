import { useState } from "react";
import { ComingSoonNotification } from "@/components/app/ComingSoonNotification";

interface PaymentTriageTabsProps {
  totalPayments: number;
}

type TabId = "confident" | "needs_review" | "unmatched";

/** Payment categorization tabs for filtering by confidence level: confident, needs-review, or unmatched. Shows placeholder counts; backend categorization logic is coming soon. */
export function PaymentTriageTabs({ totalPayments }: PaymentTriageTabsProps) {
  const [selectedTab, setSelectedTab] = useState<TabId>("confident");
  const [showComingSoon, setShowComingSoon] = useState(false);

  const tabs: Array<{
    id: TabId;
    label: string;
    count: string;
  }> = [
    { id: "confident", label: "Confident", count: "—" },
    { id: "needs_review", label: "Needs review", count: "—" },
    { id: "unmatched", label: "Unmatched", count: "—" },
  ];

  const handleTabClick = (tabId: TabId) => {
    setSelectedTab(tabId);
    setShowComingSoon(true);
    const timer = setTimeout(() => setShowComingSoon(false), 3000);
    return () => clearTimeout(timer);
  };

  return (
    <div className="space-y-3">
      {/* Tab buttons */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`px-4 py-2 rounded-card border text-body font-semibold transition-colors ${
              selectedTab === tab.id
                ? "border-accent bg-accent-tint text-fg"
                : "border-hairline bg-card text-fg-muted hover:bg-hovered"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-prose text-fg-muted">({tab.count})</span>
          </button>
        ))}
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
