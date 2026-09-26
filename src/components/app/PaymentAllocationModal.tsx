import { useEffect, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/format";
import { getAccountInvoices, accountsQueryKeys } from "@/lib/services/accounts";
import type { AccountPayment } from "@/lib/schemas/accounts";
import { useAllocationState } from "@/lib/hooks/useAllocationState";

interface PaymentAllocationModalProps {
  open: boolean;
  payment: AccountPayment | null;
  accountId: string;
  onOpenChange: (open: boolean) => void;
}

export function PaymentAllocationModal({
  open,
  payment,
  accountId,
  onOpenChange,
}: PaymentAllocationModalProps) {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [showApplyComingSoon, setShowApplyComingSoon] = useState(false);
  const [showReverseComingSoon, setShowReverseComingSoon] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: accountsQueryKeys.invoices(accountId),
    queryFn: () => getAccountInvoices(accountId),
    enabled: open && !!payment,
  });

  const allocation = useAllocationState(
    payment?.amount ?? "0.00",
    payment?.allocations
      ? payment.allocations.map((a) => ({
          invoiceId: a.invoice_id,
          invoiceNumber: a.invoice_number,
          amount: a.amount,
        }))
      : undefined,
  );

  useEffect(() => {
    if (!open || !invoicesQuery.data) return;

    const invoices = invoicesQuery.data.groups.flatMap((group) =>
      group.invoices.map((inv) => ({
        invoiceId: inv.invoice_id,
        invoiceNumber: inv.number,
        outstandingBalance: inv.amount_outstanding,
      })),
    );

    allocation.setInvoices(invoices);
  }, [invoicesQuery.data, open, allocation]);

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
    if (isDirty && !unsavedChanges) {
      setUnsavedChanges(true);
      return;
    }
    setIsDirty(false);
    setUnsavedChanges(false);
    onOpenChange(false);
  };

  const handleApply = () => {
    if (allocation.balance.isOverAllocated) return;
    // No backend endpoint exists yet for allocations
    // This is a draft-only modal
    setShowApplyComingSoon(true);
    const timer = setTimeout(() => setShowApplyComingSoon(false), 4000);
    return () => clearTimeout(timer);
  };

  const handleReverse = () => {
    setShowReverseComingSoon(true);
    const timer = setTimeout(() => setShowReverseComingSoon(false), 4000);
    return () => clearTimeout(timer);
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Allocate Payment</DialogTitle>
          <DialogDescription>
            {payment.source} · {payment.reference}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {/* Payment summary */}
          <div className="flex justify-between items-center px-6 py-3 bg-subtle rounded-card border border-hairline">
            <div>
              <p className="text-prose text-fg-muted">Received Amount</p>
              <p className="text-metric font-bold text-fg">{formatINR(payment.amount)}</p>
            </div>
            <div className="text-right">
              <p className="text-prose text-fg-muted">Date</p>
              <p className="text-body font-semibold text-fg">{payment.date}</p>
            </div>
          </div>

          {/* TDS Section */}
          <div className="px-6 space-y-3">
            <label className="block">
              <span className="text-prose font-semibold text-fg-muted">TDS Section</span>
              <Select
                value={allocation.tdsSection}
                onValueChange={(val) => {
                  allocation.setTdsSection(val as "None" | "194C" | "194J" | "194H" | "Custom");
                  setIsDirty(true);
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  <SelectItem value="194C">194C</SelectItem>
                  <SelectItem value="194J">194J</SelectItem>
                  <SelectItem value="194H">194H</SelectItem>
                  <SelectItem value="Custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {allocation.tdsSection === "Custom" && (
              <label className="block">
                <span className="text-prose font-semibold text-fg-muted">TDS Percentage</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={allocation.tdsPercentage}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 100) {
                      allocation.setTdsPercentage(val);
                      setIsDirty(true);
                    }
                  }}
                  className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
                />
              </label>
            )}
          </div>

          {/* Invoice allocation rows */}
          <div className="px-6">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-prose font-semibold text-fg-muted">Invoices</label>
              <AppButton variant="text" onClick={handleAutoFill} disabled={invoicesQuery.isLoading}>
                Auto-fill oldest first
              </AppButton>
            </div>

            <div className="space-y-2 border border-hairline rounded-card">
              {allocation.rows.length === 0 ? (
                <div className="p-4 text-center text-prose text-fg-muted">
                  No invoices available.
                </div>
              ) : (
                allocation.rows.map((row) => (
                  <div
                    key={row.invoiceId}
                    className="flex items-center gap-3 p-3 hover:bg-hovered border-b border-hairline last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => {
                        allocation.toggleInvoice(row.invoiceId);
                        setIsDirty(true);
                      }}
                      className="w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-body font-semibold text-fg">{row.invoiceNumber}</div>
                      <div className="text-prose text-fg-muted">
                        Outstanding: {formatINR(row.outstandingBalance)}
                      </div>
                    </div>
                    <input
                      ref={row === allocation.rows[0] ? firstInputRef : null}
                      type="text"
                      value={row.allocated}
                      onChange={(e) => {
                        allocation.setAllocationAmount(row.invoiceId, e.target.value);
                        setIsDirty(true);
                      }}
                      disabled={!row.selected}
                      placeholder="0.00"
                      className="w-24 rounded-input border border-stroke bg-card px-2 py-1 text-right text-body font-semibold text-fg disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Balance state */}
          <div className="px-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center py-2 border-b border-hairline">
                <span className="text-prose text-fg">Allocated</span>
                <span className="tnum text-body font-semibold text-fg">
                  {formatINR(allocation.balance.allocated)}
                </span>
              </div>

              {allocation.balance.isOverAllocated ? (
                <div className="flex justify-between items-center py-2 bg-danger-tint rounded px-3 border border-danger-edge">
                  <span className="text-prose font-semibold text-danger">Over-allocated by</span>
                  <span className="tnum text-body font-bold text-danger">
                    +
                    {formatINR(
                      (() => {
                        const excess =
                          allocation.balance.allocatedCents - allocation.balance.receivedCents;
                        const rupees = excess / 100n;
                        const paise = excess % 100n;
                        return `${rupees}.${paise.toString().padStart(2, "0")}`;
                      })(),
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex justify-between items-center py-2">
                  <span className="text-prose text-fg-muted">Remaining</span>
                  <span className="tnum text-body font-semibold text-fg">
                    {formatINR(allocation.balance.remaining)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Apply coming soon notification */}
          {showApplyComingSoon && (
            <div className="px-6">
              <ComingSoonNotification
                message="Saving allocations is coming soon — backend support is being added."
                variant="toast"
              />
            </div>
          )}

          {/* Reverse coming soon notification */}
          {showReverseComingSoon && (
            <div className="px-6">
              <ComingSoonNotification
                message="Allocation reversal is coming soon — backend support is being added."
                variant="toast"
              />
            </div>
          )}

          {/* Unsaved changes confirmation */}
          {unsavedChanges && (
            <div className="px-6 py-3 bg-warn-tint border border-warn-edge rounded-card">
              <p className="text-body font-semibold text-warn">
                You have unsaved changes. Close without saving?
              </p>
              <div className="mt-2 flex gap-2">
                <AppButton
                  variant="secondary"
                  onClick={() => {
                    setUnsavedChanges(false);
                    setIsDirty(false);
                  }}
                >
                  Keep editing
                </AppButton>
                <AppButton
                  variant="text"
                  onClick={() => {
                    setIsDirty(false);
                    setUnsavedChanges(false);
                    onOpenChange(false);
                  }}
                >
                  Discard
                </AppButton>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <AppButton variant="secondary" onClick={handleClose}>
            Cancel
          </AppButton>
          {payment?.allocations && payment.allocations.length > 0 && (
            <AppButton variant="secondary" onClick={handleReverse}>
              Reverse allocation
            </AppButton>
          )}
          <AppButton
            disabled={allocation.balance.isOverAllocated}
            onClick={handleApply}
            title={
              allocation.balance.isOverAllocated
                ? "Cannot apply: allocation exceeds received amount"
                : ""
            }
          >
            Apply allocation
          </AppButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
