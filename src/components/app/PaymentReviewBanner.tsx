import { AlertCircle } from "lucide-react";

interface PaymentReviewBannerProps {
  unreviewed?: number;
  heldInvoiceCount?: number;
}

/** Warning banner for stale/unreviewed payments. Shows when payments need review. */
export function PaymentReviewBanner({
  unreviewed = 0,
  heldInvoiceCount = 0,
}: PaymentReviewBannerProps) {
  if (unreviewed === 0) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-card border border-warn-edge bg-warn-tint px-4 py-3">
      <AlertCircle className="w-5 h-5 text-warn flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-body font-semibold text-warn">
          {unreviewed} payment{unreviewed !== 1 ? "s" : ""} unreviewed
        </p>
        {heldInvoiceCount > 0 && (
          <p className="text-prose text-warn mt-0.5">
            {heldInvoiceCount} invoice{heldInvoiceCount !== 1 ? "s" : ""}{" "}
            {heldInvoiceCount !== 1 ? "are" : "is"} on hold and not being chased.
          </p>
        )}
      </div>
    </div>
  );
}
