import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { PaymentCard } from "@/components/app/PaymentCard";
import { PaymentAllocationModal } from "@/components/app/PaymentAllocationModal";
import { PaymentTriageTabs } from "@/components/app/PaymentTriageTabs";
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
      // The shortcuts belong to the card list: leave keys alone while the
      // modal is open or when focus is on a control that handles them itself.
      if (allocationModalOpen || items.length === 0) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, select, button, a, [role='dialog'], [contenteditable]")
      ) {
        return;
      }

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

        case "enter": {
          const payment = selectedPaymentIndex !== null ? items[selectedPaymentIndex] : undefined;
          if (payment?.action_kind === "allocate") {
            e.preventDefault();
            setAllocationPayment(payment);
            setAllocationModalOpen(true);
          }
          break;
        }

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
  }, [paymentsQuery.data?.items, selectedPaymentIndex, allocationModalOpen]);

  const isPending = paymentsQuery.isPending;
  const isError = paymentsQuery.isError;
  const data = paymentsQuery.data;
  const isEmpty = data && data.items.length === 0;
  const payments = data?.items ?? [];
  const stats = data?.stats ?? {
    received_90d: "0.00",
    unapplied_total: "0.00",
    average_delay_days: null,
  };
  const hasUnapplied = !isZeroMoney(stats.unapplied_total);

  const errorMessage =
    isError && paymentsQuery.error instanceof AccountsApiError
      ? paymentsQuery.error.message
      : isError
        ? "Couldn't load payments."
        : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Stats always visible */}
      <StatRow
        received={stats.received_90d}
        unapplied={stats.unapplied_total}
        averageDelay={stats.average_delay_days}
      />

      {/* Triage tabs */}
      <PaymentTriageTabs totalPayments={payments.length} />

      {/* Held invoices section */}
      <HeldInvoicesSection invoices={[]} />

      {/* Payment cards or loading/empty/error states */}
      <div className="space-y-3">
        {isPending ? (
          // Loading state
          <>
            <div className="h-32 rounded-card bg-subtle animate-pulse" />
            <div className="h-32 rounded-card bg-subtle animate-pulse" />
            <div className="h-32 rounded-card bg-subtle animate-pulse" />
          </>
        ) : isError ? (
          // Error state
          <div className="rounded-card border border-hairline bg-card p-6">
            <p className="text-body font-semibold text-fg">{errorMessage}</p>
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
        ) : isEmpty ? (
          // Empty state
          <div className="rounded-card border border-hairline bg-card p-12 text-center">
            <h3 className="text-body font-semibold text-fg">Nothing to review.</h3>
            <p className="text-prose text-fg-muted mt-2">
              Payments will appear here as your bank alerts come in.
            </p>
            <AppButton variant="secondary" className="mt-4">
              Set up payment alerts
            </AppButton>
          </div>
        ) : (
          // Payments cards
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

      {/* Unapplied credit banner */}
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

      {/* Allocation modal */}
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

/** Metric tile displaying a labeled stat value (received, unapplied, delay). */
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
