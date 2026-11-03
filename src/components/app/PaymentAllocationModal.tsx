import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppButton } from "@/components/app/AppButton";
import { ComingSoonNotification } from "@/components/app/ComingSoonNotification";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR, formatShortDate } from "@/lib/format";
import { getAccountInvoices, accountsQueryKeys } from "@/lib/services/accounts";
import type { AccountPayment } from "@/lib/schemas/accounts";
import { moneyToCents, useAllocationState } from "@/lib/hooks/useAllocationState";

interface PaymentAllocationModalProps {
  open: boolean;
  payment: AccountPayment | null;
  accountId: string;
  onOpenChange: (open: boolean) => void;
}

type TdsOption = "None" | "194C" | "194J" | "194H" | "Custom";

/** Modal for allocating received payments to unpaid invoices with per-invoice TDS selection and balance tracking. Prevents over-allocation and supports auto-fill. */
export function PaymentAllocationModal({
  open,
  payment,
  accountId,
  onOpenChange,
}: PaymentAllocationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [comingSoonMessage, setComingSoonMessage] = useState<string | null>(null);
  const comingSoonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmingReverse, setConfirmingReverse] = useState(false);

  useEffect(
    () => () => {
      if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    },
    [],
  );

  const showComingSoon = (message: string) => {
    setComingSoonMessage(message);
    if (comingSoonTimer.current) clearTimeout(comingSoonTimer.current);
    comingSoonTimer.current = setTimeout(() => setComingSoonMessage(null), 4000);
  };

  const invoicesQuery = useQuery({
    queryKey: accountsQueryKeys.invoices(accountId),
    queryFn: () => getAccountInvoices(accountId),
    enabled: open && !!payment,
  });

  // Memoised so setInvoices keeps its identity between renders; a new array
  // here would re-run the effect below and reset the user's edits.
  const initialAllocations = useMemo(
    () =>
      payment?.allocations.map((a) => ({
        invoiceId: a.invoice_id,
        invoiceNumber: a.invoice_number,
        amount: a.amount,
      })),
    [payment],
  );
  const allocation = useAllocationState(payment?.amount ?? "0.00", initialAllocations);
  const { setInvoices } = allocation;

  useEffect(() => {
    if (!open || !invoicesQuery.data) return;

    const invoices = invoicesQuery.data.groups.flatMap((group) =>
      group.invoices.map((inv) => ({
        invoiceId: inv.invoice_id,
        invoiceNumber: inv.number,
        outstandingBalance: inv.amount_outstanding,
      })),
    );

    setInvoices(invoices);
  }, [invoicesQuery.data, open, setInvoices]);

  const handleAutoFill = () => {
    if (!invoicesQuery.data) return;

    const invoicesByAge = invoicesQuery.data.groups.flatMap((group) =>
      group.invoices.map((inv) => ({
        invoiceId: inv.invoice_id,
        outstandingBalance: inv.amount_outstanding,
      })),
    );

    allocation.autoFillOldestFirst(invoicesByAge);
    setIsDirty(true);
  };

  const handleClose = () => {
    if (isDirty) {
      if (!window.confirm("Discard changes to this allocation?")) return;
    }
    setIsDirty(false);
    setConfirmingReverse(false);
    onOpenChange(false);
  };

  const handleApply = () => {
    if (allocation.balance.isOverAllocated) return;
    showComingSoon("Saving allocations is coming soon — backend support is being added.");
  };

  const handleDialogKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab" && dialogRef.current) {
      const focusables = Array.from(
        dialogRef.current.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !(el as HTMLButtonElement | HTMLInputElement).disabled);

      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        (last as HTMLElement).focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        (first as HTMLElement).focus();
      }
    }
  };

  if (!payment) return null;

  const hasAllocations = payment.allocations.length > 0;
  const remainingCents = allocation.balance.receivedCents - allocation.balance.allocatedCents;
  const isFullyAllocated = allocation.balance.allocatedCents === allocation.balance.receivedCents;
  // Money left over that is smaller than every unpicked invoice's balance
  // can't settle anything, so it stays on the account as credit.
  const uncheckedRows = allocation.rows.filter((r) => !r.selected);
  const heldAsCredit =
    remainingCents > 0n &&
    uncheckedRows.length > 0 &&
    uncheckedRows.every((r) => remainingCents < moneyToCents(r.outstandingBalance));
  const tdsOptions: TdsOption[] = ["None", "194J", "194C", "194H", "Custom"];

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-hidden flex flex-col"
        onKeyDown={handleDialogKeyDown}
      >
        <DialogHeader>
          <DialogTitle>Allocate payment</DialogTitle>
          <DialogDescription>
            {formatINR(payment.amount)} received · {payment.source} ·{" "}
            {formatShortDate(payment.date)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1" ref={dialogRef}>
          <div className="px-6">
            {/* Auto-fill button */}
            <AppButton
              variant="text"
              onClick={handleAutoFill}
              disabled={invoicesQuery.isLoading}
              className="mb-3"
            >
              Auto-fill oldest first
            </AppButton>

            {/* Invoice rows */}
            {invoicesQuery.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-subtle rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-hairline">
                {allocation.rows.map((row) => (
                  <div key={row.invoiceId} className="py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="checkbox"
                        id={`chk-${row.invoiceId}`}
                        checked={row.selected}
                        onChange={() => {
                          allocation.toggleInvoice(row.invoiceId);
                          setIsDirty(true);
                        }}
                        className="w-4 h-4 accent-accent"
                      />
                      <label
                        htmlFor={`chk-${row.invoiceId}`}
                        className="flex-1 text-body font-semibold text-fg cursor-pointer"
                      >
                        {row.invoiceNumber}{" "}
                        <span className="font-normal text-fg-muted">· balance</span>{" "}
                        <span className="tnum font-semibold text-fg">
                          {formatINR(row.outstandingBalance)}
                        </span>
                      </label>
                      <label htmlFor={`amt-${row.invoiceId}`} className="sr-only">
                        Amount allocated to {row.invoiceNumber}
                      </label>
                      <input
                        id={`amt-${row.invoiceId}`}
                        type="text"
                        inputMode="numeric"
                        value={row.allocated}
                        onChange={(e) => {
                          allocation.setAllocationAmount(row.invoiceId, e.target.value);
                          setIsDirty(true);
                        }}
                        disabled={!row.selected}
                        className="tnum w-28 rounded border border-hairline px-2 py-1.5 text-right text-body font-semibold text-fg disabled:opacity-50 disabled:cursor-not-allowed focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                      />
                    </div>

                    {/* TDS options - show for selected invoices */}
                    {row.selected && (
                      <div className="pl-7 space-y-2">
                        <div className="text-prose font-semibold text-fg-muted uppercase tracking-wide text-xs">
                          TDS treatment
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {tdsOptions.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              disabled
                              title="Coming soon"
                              className="px-3 py-1 text-prose font-semibold border border-hairline rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Balance tracking */}
          <div className="px-6 space-y-2">
            <div
              className={`rounded-lg border p-3 flex items-center gap-2 ${
                allocation.balance.isOverAllocated
                  ? "bg-error-tint border-error-edge"
                  : isFullyAllocated
                    ? "bg-accent-tint border-accent"
                    : "bg-warn-tint border-warn-edge"
              }`}
            >
              {!allocation.balance.isOverAllocated && isFullyAllocated && (
                <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0">
                  <circle cx="8" cy="8" r="7" fill="#DCEEE5" />
                  <path
                    d="M5 8.2 L7 10.2 L11 6"
                    stroke="#087A52"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <div className="tnum text-body font-semibold">
                {allocation.balance.isOverAllocated
                  ? `${formatINR(
                      (() => {
                        const excess =
                          allocation.balance.allocatedCents - allocation.balance.receivedCents;
                        const rupees = excess / 100n;
                        const paise = excess % 100n;
                        return `${rupees}.${paise.toString().padStart(2, "0")}`;
                      })(),
                    )} over-allocated`
                  : isFullyAllocated
                    ? "Fully allocated"
                    : `${formatINR(allocation.balance.remaining)} left`}
              </div>
            </div>

            {heldAsCredit && (
              <div className="text-prose text-warn">
                {formatINR(allocation.balance.remaining)} will be held as unapplied credit on this
                account.
              </div>
            )}

            {allocation.balance.isOverAllocated && (
              <div className="text-prose text-danger">
                You've allocated{" "}
                {formatINR(
                  (() => {
                    const excess =
                      allocation.balance.allocatedCents - allocation.balance.receivedCents;
                    const rupees = excess / 100n;
                    const paise = excess % 100n;
                    return `${rupees}.${paise.toString().padStart(2, "0")}`;
                  })(),
                )}{" "}
                more than was received.
              </div>
            )}
          </div>

          {comingSoonMessage && (
            <div className="px-6">
              <ComingSoonNotification message={comingSoonMessage} variant="toast" />
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between px-6 py-4 border-t border-hairline">
          {!confirmingReverse && hasAllocations && (
            <AppButton
              variant="secondary"
              onClick={() => setConfirmingReverse(true)}
              className="text-danger"
            >
              Reverse this allocation
            </AppButton>
          )}

          {confirmingReverse && (
            <div className="flex items-center gap-3">
              <p className="text-prose text-fg-muted">
                Reverse {formatINR(payment.amount)} across {payment.allocations.length} invoice
                {payment.allocations.length !== 1 ? "s" : ""}? Their balances and aging will be
                restored.
              </p>
              <AppButton variant="secondary" onClick={() => setConfirmingReverse(false)}>
                Cancel
              </AppButton>
              <AppButton
                variant="secondary"
                onClick={() => {
                  setConfirmingReverse(false);
                  showComingSoon(
                    "Reversing allocations is coming soon — backend support is being added.",
                  );
                }}
              >
                Reverse allocation
              </AppButton>
            </div>
          )}

          {!confirmingReverse && (
            <div className="flex gap-2">
              <AppButton variant="secondary" onClick={handleClose}>
                Cancel
              </AppButton>
              <AppButton
                onClick={handleApply}
                disabled={allocation.balance.isOverAllocated}
                title={
                  allocation.balance.isOverAllocated
                    ? "Cannot apply: allocation exceeds received amount"
                    : ""
                }
              >
                Apply
              </AppButton>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
