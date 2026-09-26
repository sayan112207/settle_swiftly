import { useState } from "react";
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

/** Displays a received payment with date, amount, reference, applied-to status, and allocation details. Selection state highlights the card for keyboard navigation (Enter triggers allocate). All advanced actions show coming-soon placeholders. */
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
  const hasAllocations = payment.allocations.length > 0;
  const allocatedAmount =
    payment.allocations.length > 0
      ? payment.allocations.reduce((sum, a) => {
          const s = parseFloat(sum);
          const aAmount = parseFloat(a.amount);
          return String(s + aAmount);
        }, "0.00")
      : "0.00";

  const unappliedAmount = isZeroMoney(allocatedAmount)
    ? payment.amount
    : String(parseFloat(payment.amount) - parseFloat(allocatedAmount));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isSelected) {
      e.preventDefault();
      onAllocate?.();
    }
  };

  return (
    <div
      className={`rounded-card border p-4 transition-colors ${
        isSelected ? "border-accent bg-accent-tint" : "border-hairline bg-card hover:bg-hovered"
      }`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isSelected ? 0 : -1}
    >
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Date and source */}
        <div>
          <div className="text-prose text-fg-muted mb-1">Received</div>
          <div className="text-body font-semibold text-fg">{formatShortDate(payment.date)}</div>
          <div className="text-prose font-normal text-fg-muted">{payment.source}</div>
        </div>

        {/* Amount */}
        <div className="text-right">
          <div className="text-prose text-fg-muted mb-1">Amount</div>
          <div className="tnum text-metric font-bold text-fg">{formatINR(payment.amount)}</div>
          <div
            className={`text-prose font-normal ${
              payment.status_tone === "danger"
                ? "text-danger"
                : payment.status_tone === "warn"
                  ? "text-warn"
                  : "text-fg-muted"
            }`}
          >
            {payment.status_label}
          </div>
        </div>
      </div>

      {/* Reference */}
      <div className="mb-4 py-3 border-t border-b border-hairline">
        <div className="text-prose text-fg-muted mb-1">Reference</div>
        <div className="text-body font-mono text-fg">{payment.reference}</div>
      </div>

      {/* Applied to / Allocations */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-prose text-fg-muted mb-1">Applied to</div>
          <div
            className={`text-body font-semibold ${payment.is_applied ? "text-fg" : "text-danger"}`}
          >
            {payment.applied_to}
          </div>
        </div>

        {hasAllocations && (
          <div className="text-right">
            <div className="text-prose text-fg-muted mb-1">Allocated</div>
            <div className="tnum text-body font-semibold text-fg">{formatINR(allocatedAmount)}</div>
            {!isZeroMoney(unappliedAmount) && (
              <div className="tnum text-prose font-normal text-fg-muted">
                Unapplied: {formatINR(unappliedAmount)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Allocations detail */}
      {hasAllocations && (
        <div className="mb-4 space-y-2">
          <div className="text-prose text-fg-muted">Allocated invoices:</div>
          {payment.allocations.map((alloc) => (
            <div key={alloc.invoice_id} className="flex justify-between text-prose">
              <span className="text-fg">{alloc.invoice_number}</span>
              <span className="tnum font-semibold text-fg">{formatINR(alloc.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {/* Settle in full (primary action when available) */}
          {payment.action_kind === "allocate" && (
            <AppButton variant="primary" onClick={onAllocate}>
              Settle in full
            </AppButton>
          )}

          {/* Adjust */}
          {payment.action_kind === "adjust" && (
            <AppButton
              variant="secondary"
              onClick={() => {
                setComingSoonAction("adjust");
                setTimeout(() => setComingSoonAction(null), 3000);
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
                setComingSoonAction("view_split");
                setTimeout(() => setComingSoonAction(null), 3000);
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
              setComingSoonAction("dismiss");
              setTimeout(() => setComingSoonAction(null), 3000);
              onDismiss?.();
            }}
          >
            Dismiss
          </AppButton>
        </div>

        {/* Coming soon notifications */}
        {comingSoonAction === "adjust" && (
          <ComingSoonNotification
            message="Adjust is coming soon — backend support is being added."
            variant="inline"
          />
        )}
        {comingSoonAction === "view_split" && (
          <ComingSoonNotification
            message="View split is coming soon — backend support is being added."
            variant="inline"
          />
        )}
        {comingSoonAction === "dismiss" && (
          <ComingSoonNotification
            message="Dismiss is coming soon — backend support is being added."
            variant="inline"
          />
        )}
      </div>
    </div>
  );
}
