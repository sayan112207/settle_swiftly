import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PaymentCard } from "@/components/app/PaymentCard";
import { PaymentAllocationModal } from "@/components/app/PaymentAllocationModal";
import { PaymentTriageTabs } from "@/components/app/PaymentTriageTabs";
import { PaymentReviewBanner } from "@/components/app/PaymentReviewBanner";
import { HeldInvoicesSection } from "@/components/app/HeldInvoicesSection";
import { formatINR, isZeroMoney } from "@/lib/format";
import type { AccountPayment } from "@/lib/schemas/accounts";
import { AccountsApiError, accountsQueryKeys, getAccountPayments } from "@/lib/services/accounts";

type AccountPaymentsPanelProps = {
  accountId: string;
  accountName: string;
};

/** Stats strip, payment cards, unapplied-credit banner, allocation modal. */
export function AccountPaymentsPanel({ accountId, accountName }: AccountPaymentsPanelProps) {
  const paymentsQuery = useQuery({
    queryKey: accountsQueryKeys.payments(accountId),
    queryFn: () => getAccountPayments(accountId),
    retry: false,
  });

  const [selectedPaymentIndex, setSelectedPaymentIndex] = useState<number | null>(null);
  const [allocationPayment, setAllocationPayment] = useState<AccountPayment | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);

  // Keyboard navigation
  useEffect(() => {
    const items = paymentsQuery.data?.items ?? [];

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (items.length === 0) return;

      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          setSelectedPaymentIndex((prev) =>
            prev === null ? 0 : Math.min(prev + 1, items.length - 1),
          );
          break;

        case "k":
          e.preventDefault();
          setSelectedPaymentIndex((prev) =>
            prev === null ? items.length - 1 : Math.max(prev - 1, 0),
          );
          break;

        case "enter":
          e.preventDefault();
          if (selectedPaymentIndex !== null) {
            const payment = items[selectedPaymentIndex];
            if (payment?.action_kind === "allocate") {
              setAllocationPayment(payment);
              setAllocationModalOpen(true);
            }
          }
          break;

        case "x":
          e.preventDefault();
          // Dismiss not supported by current backend
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paymentsQuery.data?.items, selectedPaymentIndex]);

  if (paymentsQuery.isPending) {
    return <PaymentsLoading />;
  }

  if (paymentsQuery.isError) {
    const message =
      paymentsQuery.error instanceof AccountsApiError
        ? paymentsQuery.error.message
        : "Couldn't load payments.";
    return (
      <div className="rounded-card border border-hairline bg-card p-6">
        <p className="text-body font-semibold text-fg">{message}</p>
        <div className="mt-3">
          <AppButton
            variant="secondary"
            onClick={() => {
              void paymentsQuery.refetch();
            }}
          >
            Retry
          </AppButton>
        </div>
      </div>
    );
  }

  const data = paymentsQuery.data;
  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-card p-8 text-center">
        <p className="text-body font-semibold text-fg">
          No payments recorded from {accountName} yet.
        </p>
      </div>
    );
  }

  const { stats, items: payments } = data;
  const hasUnapplied = !isZeroMoney(stats.unapplied_total);

  return (
    <div className="flex flex-col gap-5">
      <StatRow
        received={stats.received_90d}
        unapplied={stats.unapplied_total}
        averageDelay={stats.average_delay_days}
      />

      {/* Triage tabs */}
      <PaymentTriageTabs totalPayments={payments.length} />

      {/* Stale/unreviewed warning */}
      <PaymentReviewBanner />

      {/* Held invoices section */}
      <HeldInvoicesSection />

      {/* Payment cards */}
      <div className="space-y-3">
        {payments.length === 0 ? (
          <div className="text-center py-8 text-prose text-fg-muted">No payments in this view.</div>
        ) : (
          payments.map((payment, idx) => (
            <PaymentCard
              key={payment.payment_id}
              payment={payment}
              isSelected={selectedPaymentIndex === idx}
              onSelect={() => setSelectedPaymentIndex(idx)}
              onAllocate={() => {
                setAllocationPayment(payment);
                setAllocationModalOpen(true);
              }}
              onAdjust={() => {
                // Adjust shows coming soon via card state
              }}
              onDismiss={() => {
                // Dismiss shows coming soon via card state
              }}
              onViewSplit={() => {
                // View split shows coming soon via card state
              }}
            />
          ))
        )}
      </div>

      {hasUnapplied ? (
        <div className="flex items-center justify-between gap-4 rounded-card border border-warn-edge bg-warn-tint px-4 py-3">
          <p className="text-body font-semibold text-warn">
            {formatINR(stats.unapplied_total)} is held as unapplied credit on this account.
          </p>
          <Link
            to="/app/payments"
            className="shrink-0 text-body font-semibold text-accent hover:text-accent-hover"
          >
            Go to payment triage
          </Link>
        </div>
      ) : null}

      <PaymentAllocationModal
        open={allocationModalOpen}
        payment={allocationPayment}
        accountId={accountId}
        onOpenChange={setAllocationModalOpen}
      />
    </div>
  );
}

function StatRow({
  received,
  unapplied,
  averageDelay,
}: {
  received: string;
  unapplied: string;
  averageDelay: number | null;
}) {
  return (
    <dl className="grid grid-cols-3 gap-4">
      <Stat label="received in 90 days" value={formatINR(received)} tone="fg" />
      <Stat label="unapplied credit" value={formatINR(unapplied)} tone="warn" />
      <Stat
        label="average delay"
        value={averageDelay === null ? "—" : `${averageDelay} days`}
        tone={averageDelay === null ? "muted" : "danger"}
      />
    </dl>
  );
}

const STAT_TONE = {
  fg: "text-fg",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-fg-muted",
} as const;

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof STAT_TONE;
}) {
  return (
    <div className="rounded-card border border-hairline bg-card px-5 py-4">
      <dd className={`tnum text-metric font-bold tracking-tight ${STAT_TONE[tone]}`}>{value}</dd>
      <dt className="mt-1 text-prose font-normal text-fg-muted">{label}</dt>
    </div>
  );
}

function PaymentsLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-hairline bg-card px-5 py-4">
            <AppSkeleton className="h-7 w-32 rounded-check" />
            <AppSkeleton className="mt-2 h-4 w-24 rounded-check" />
          </div>
        ))}
      </div>
      <div className="rounded-card border border-hairline bg-card p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <AppSkeleton key={i} className="mb-3 h-11 w-full rounded-check" />
        ))}
      </div>
    </div>
  );
}
