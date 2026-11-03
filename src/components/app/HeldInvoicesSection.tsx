import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatINR } from "@/lib/format";

interface HeldInvoice {
  number: string;
  account: string;
  amount: string;
}

interface HeldInvoicesSectionProps {
  invoices?: HeldInvoice[];
}

/** Collapsible section displaying invoices on hold during manual payment reconciliation. */
export function HeldInvoicesSection({ invoices = [] }: HeldInvoicesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = invoices.length;

  if (count === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-accent font-semibold text-body flex items-center gap-1 hover:text-accent-hover transition-colors"
      >
        {count} invoice{count !== 1 ? "s" : ""} on hold while you check{" "}
        <span className="text-prose text-accent">{isExpanded ? "▲" : "▼"}</span>
      </button>

      {isExpanded && (
        <div className="space-y-2 pl-4">
          {invoices.map((inv) => (
            <div key={inv.number} className="text-prose text-fg-muted">
              <Link
                to="/app/invoices"
                className="font-semibold text-accent hover:text-accent-hover"
              >
                {inv.number}
              </Link>{" "}
              · {inv.account} · <span className="tnum font-semibold text-fg">{inv.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
