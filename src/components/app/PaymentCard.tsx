import { useEffect, useRef, useState } from "react";
import { AppButton } from "@/components/app/AppButton";
import { ComingSoonNotification } from "@/components/app/ComingSoonNotification";
import type { AccountPayment } from "@/lib/schemas/accounts";
import { formatINR, formatShortDate, isZeroMoney } from "@/lib/format";

interface PaymentCardProps {
  payment: AccountPayment;
  isSelected?: boolean;
  onSelect?: () => void;
  onAllocate?: () => void;
  onAdjust?: () => void;
  onDismiss?: () => void;
  onViewSplit?: () => void;
}

const CONFIDENCE_BADGES = {
  likely: { label: "Likely match", bg: "bg-warn-tint", color: "text-warn" },
  uncertain: { label: "Uncertain", bg: "bg-subtle", color: "text-fg-muted" },
  unmatched: { label: "Unmatched", bg: "bg-error-tint", color: "text-danger" },
} as const;

/** Displays a received payment with amount, date, remitter, UTR, matched invoice, shortfall notes, and allocation actions. Selection state highlights for keyboard navigation. */
export function PaymentCard({
  payment,
  isSelected = false,
  onSelect,
  onAllocate,
  onAdjust,
  onDismiss,
  onViewSplit,
}: PaymentCardProps) {
  const [comingSoonAction, setComingSoonAction] = useState<string | null>(null);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    },
    [],
  );

  const showComingSoon = (action: string) => {
    setComingSoonAction(action);
    if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setComingSoonAction(null), 3000);
  };

  // A warn-toned TDS label gets its own callout below, so the matched-invoice
  // line leaves it out rather than printing it twice.
  const showTdsNote = payment.status_tone === "warn" && payment.status_label.includes("TDS");
  const hasAllocations = payment.allocations.length > 0;

  const firstAllocation = payment.allocations[0];

  // Determine confidence level from status (backend provides status_label)
  // The API doesn't score matches yet, so the only signal is whether the
  // payment has been allocated to anything.
  const confidenceBadge = hasAllocations ? CONFIDENCE_BADGES.likely : CONFIDENCE_BADGES.unmatched;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isSelected) {
      e.preventDefault();
      onAllocate?.();
    }
  };

  return (
    <div
      className={`rounded-card border p-5 transition-colors ${
        isSelected ? "border-accent bg-accent-tint" : "border-hairline bg-card hover:bg-hovered"
      }`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isSelected ? 0 : -1}
    >
      {/* Header: Amount, Date, and Confidence Badge */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="tnum text-metric font-bold text-fg mb-0.5">
            {formatINR(payment.amount)} received · {formatShortDate(payment.date)}
          </div>
          {/* Source and reference (already labelled, e.g. "UTR …", "Cheque …") */}
          <div className="text-prose text-fg-muted truncate" title={payment.source}>
            {payment.source}
            {payment.reference ? ` · ${payment.reference}` : null}
          </div>
        </div>
        <div
          className={`${confidenceBadge.bg} ${confidenceBadge.color} text-prose font-semibold px-3 py-1 rounded-full flex-shrink-0`}
        >
          {confidenceBadge.label}
        </div>
      </div>

      {/* Matched Invoice Box */}
      {firstAllocation && (
        <div className="bg-subtle rounded-lg p-3 mb-3">
          <div className="text-body text-fg">
            Matched to <span className="font-semibold">{firstAllocation.invoice_number}</span>
            <span className="text-fg-muted"> · </span>
            <span className="tnum font-semibold text-fg">{formatINR(firstAllocation.amount)}</span>
            {payment.status_label && !showTdsNote && (
              <>
                <span className="text-fg-muted"> · </span>
                <span
                  className={
                    payment.status_tone === "danger"
                      ? "tnum font-semibold text-danger"
                      : payment.status_tone === "warn"
                        ? "tnum font-semibold text-warn"
                        : "text-fg-muted"
                  }
                >
                  {payment.status_label}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Shortfall/TDS Note (if applicable) */}
      {showTdsNote && (
        <div className="bg-warn-tint border border-warn-edge rounded-lg p-3 mb-3 text-prose font-semibold text-warn">
          {payment.status_label}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Settle in full (primary action) */}
        {payment.action_kind === "allocate" && (
          <AppButton variant="primary" onClick={onAllocate}>
            {payment.action_label}
          </AppButton>
        )}

        {/* Adjust */}
        {payment.action_kind === "adjust" && (
          <AppButton
            variant="secondary"
            onClick={() => {
              showComingSoon("adjust");
              onAdjust?.();
            }}
          >
            Adjust
          </AppButton>
        )}

        {/* View split */}
        {payment.action_kind === "view_split" && (
          <AppButton
            variant="secondary"
            onClick={() => {
              showComingSoon("view_split");
              onViewSplit?.();
            }}
          >
            View split
          </AppButton>
        )}

        {/* Dismiss */}
        <AppButton
          variant="secondary"
          onClick={() => {
            showComingSoon("dismiss");
            onDismiss?.();
          }}
        >
          Dismiss
        </AppButton>
      </div>

      {/* Coming soon notifications */}
      {comingSoonAction && (
        <div className="mt-3">
          <ComingSoonNotification
            message={
              comingSoonAction === "adjust"
                ? "Adjust is coming soon — backend support is being added."
                : comingSoonAction === "view_split"
                  ? "View split is coming soon — backend support is being added."
                  : "Dismiss is coming soon — backend support is being added."
            }
            variant="inline"
          />
        </div>
      )}
    </div>
  );
}
