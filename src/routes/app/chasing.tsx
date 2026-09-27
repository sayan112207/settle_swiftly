import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/format";
import {
  DashboardApiError,
  dashboardQueryKeys,
  getChaseQueue,
  postChases,
} from "@/lib/services/dashboard";
import type { ChaseQueueItem } from "@/lib/schemas/dashboard";

export const Route = createFileRoute("/app/chasing")({
  head: () => ({ meta: [{ title: `Chasing — ${PRODUCT_NAME}` }] }),
  component: ChasingLayout,
});

const CHASING_QUEUE_LIMIT = 50;
const chasingQueueKey = ["dashboard", "chase-queue", "full"] as const;

/** Extracts user-facing error message from API error or returns fallback. */
function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof DashboardApiError ? error.message : fallback;
}

/** Formats skipped chases for display in approval toast, pairing invoice numbers with reasons. */
export function skippedLabelForHeader(
  skipped: readonly { invoice_id: string; reason: string }[],
  items: readonly ChaseQueueItem[],
): string {
  return skipped
    .map((entry) => {
      const row = items.find((item) => item.invoice_id === entry.invoice_id);
      return `${row?.invoice_number ?? entry.invoice_id} (${entry.reason})`;
    })
    .join(", ");
}

/** Chasing layout: renders header with approval button, tabs, and child route outlet. */
function ChasingLayout() {
  const location = useLocation();
  const isApprovalQueue = location.pathname === "/app/chasing";
  const isCadence = location.pathname === "/app/chasing/cadence";
  const queryClient = useQueryClient();

  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);

  const queueQuery = useQuery({
    queryKey: chasingQueueKey,
    queryFn: () => getChaseQueue(CHASING_QUEUE_LIMIT),
    retry: false,
  });

  const allItems = queueQuery.data?.items ?? [];
  const items = allItems;

  async function invalidateQueues() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chasingQueueKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.chaseQueue }),
    ]);
  }

  const approveMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => postChases(invoiceIds),
    onSuccess: async (result) => {
      setPendingIds(new Set());
      setBulkError(null);
      await invalidateQueues();
      if (result.skipped.length === 0) {
        const word = result.queued === 1 ? "invoice" : "invoices";
        toast(`${result.queued} ${word} queued for chasing`);
        return;
      }
      toast(`${result.queued} queued. Skipped ${skippedLabelForHeader(result.skipped, allItems)}.`);
    },
    onError: (error) => {
      setPendingIds(new Set());
      const fallback = "Couldn't queue those chases.";
      const message = userFacingMessage(error, fallback);
      setBulkError(message);
    },
  });

  function approveAll() {
    setApproveAllOpen(false);
    const invoiceIds = items.map((item) => item.invoice_id);
    setBulkError(null);
    setPendingIds(new Set([...invoiceIds]));
    approveMutation.mutate(invoiceIds);
  }

  const totalOutstanding = items.reduce((sum, item) => sum + Number(item.amount_outstanding), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-bold tracking-tight text-fg">Chasing</h1>
          <p className="mt-1 text-prose text-fg-soft">
            Switch to automatic sending once you trust the queue.
          </p>
        </div>
        {isApprovalQueue && !queueQuery.isPending && !queueQuery.isError && items.length > 0 && (
          <AppButton
            variant="primary"
            onClick={() => setApproveAllOpen(true)}
            disabled={pendingIds.size > 0}
          >
            Approve all {items.length}
          </AppButton>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Chasing sections"
        className="mb-5 flex gap-7 border-b border-hairline"
      >
        <a
          href="/app/chasing"
          role="tab"
          aria-selected={isApprovalQueue}
          className={`border-b-2 pb-3 text-body font-semibold ${
            isApprovalQueue
              ? "border-accent-line text-fg"
              : "border-transparent text-fg-soft hover:text-fg"
          }`}
        >
          Approval queue
        </a>
        <a
          href="/app/chasing/cadence"
          role="tab"
          aria-selected={isCadence}
          className={`border-b-2 pb-3 text-body font-semibold ${
            isCadence
              ? "border-accent-line text-fg"
              : "border-transparent text-fg-soft hover:text-fg"
          }`}
        >
          Cadence
        </a>
      </div>

      {bulkError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-card border border-danger-edge bg-danger-tint px-4 py-3"
        >
          <p className="text-body font-semibold text-danger">{bulkError}</p>
        </div>
      ) : null}

      <Outlet />

      <Dialog open={approveAllOpen} onOpenChange={setApproveAllOpen}>
        <DialogContent className="rounded-card border-hairline bg-card p-5 sm:max-w-[440px]">
          <DialogTitle className="text-section font-bold tracking-tight text-fg">
            Queue {items.length} chases?
          </DialogTitle>
          <DialogDescription className="mt-2 text-prose font-normal text-fg-soft">
            {items.length} {items.length === 1 ? "invoice" : "invoices"} ·{" "}
            <span className="tnum">{formatINR(String(totalOutstanding))}</span> total value.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton variant="text" onClick={() => setApproveAllOpen(false)}>
              Cancel
            </AppButton>
            <AppButton variant="primary" onClick={approveAll} loading={approveMutation.isPending}>
              Queue {items.length} chases
            </AppButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
