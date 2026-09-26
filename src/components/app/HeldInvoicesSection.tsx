import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ComingSoonNotification } from "@/components/app/ComingSoonNotification";

/** Collapsible section for invoices on hold during manual payment reconciliation. Placeholder implementation; backend support for invoice holds is coming soon. */
export function HeldInvoicesSection() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-card border border-hairline bg-card overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-hovered transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-fg-muted" />
          ) : (
            <ChevronDown className="w-5 h-5 text-fg-muted" />
          )}
          <div className="text-left">
            <p className="text-body font-semibold text-fg">
              Invoices on hold
              <span className="ml-2 text-prose text-fg-muted">(0)</span>
            </p>
            <p className="text-prose text-fg-muted">While you check payment matches</p>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 py-4 border-t border-hairline space-y-3">
          <ComingSoonNotification
            message="Invoice hold workflow is coming soon — backend support is being added."
            variant="inline"
          />
        </div>
      )}
    </div>
  );
}
