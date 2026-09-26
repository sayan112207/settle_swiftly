import { AlertCircle } from "lucide-react";

export function PaymentReviewBanner() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-warn-edge bg-warn-tint px-4 py-3">
      <AlertCircle className="w-5 h-5 text-warn flex-shrink-0" />
      <div className="flex-1">
        <p className="text-body font-semibold text-warn">Payment review tracking is coming soon</p>
        <p className="text-prose text-warn mt-0.5">
          Backend support for stale payment detection is being added.
        </p>
      </div>
    </div>
  );
}
