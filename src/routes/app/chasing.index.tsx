import { useMutation, useQuery, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatDays, formatINR } from "@/lib/format";
import {
  DashboardApiError,
  dashboardQueryKeys,
  getChaseQueue,
  postChases,
} from "@/lib/services/dashboard";
import type { ChaseQueueItem, ChaseSkipped } from "@/lib/schemas/dashboard";
import { useChasingContext } from "@/lib/contexts/chasing-context";

export const Route = createFileRoute("/app/chasing/")({
  head: () => ({ meta: [{ title: `Chasing — ${PRODUCT_NAME}` }] }),
  component: ApprovalQueuePage,
});

/**
 * The dedicated Chasing page requests the full queue (contract max: 50), not
 * the Dashboard widget's default of 6. It uses its own query key rather than
 * `dashboardQueryKeys.chaseQueue` so the two views' differently-sized results
 * never overwrite each other in the cache; both are still invalidated
 * together after a successful chase so neither goes stale.
 */
const CHASING_QUEUE_LIMIT = 50;
const chasingQueueKey = ["dashboard", "chase-queue", "full"] as const;
const SKIPPED_PAGE_SIZE = 5;

/** Extracts user-facing error message from API error or returns fallback. */
function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof DashboardApiError ? error.message : fallback;
}

/** Formats skipped chases for display, pairing invoice numbers with skip reasons. */
export function skippedLabel(
  skipped: readonly ChaseSkipped[],
  items: readonly ChaseQueueItem[],
): string {
  return skipped
    .map((entry) => {
      const row = items.find((item) => item.invoice_id === entry.invoice_id);
      return `${row?.invoice_number ?? entry.invoice_id} (${entry.reason})`;
    })
    .join(", ");
}

/** Approval queue page: displays chase queue items with approve/skip actions. */
function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const { skippedIds, setSkippedIds } = useChasingContext();
  const bulkMutating = useIsMutating({ mutationKey: ["chasing", "approve-all"] });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skippedPage, setSkippedPage] = useState(0);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const queueQuery = useQuery({
    queryKey: chasingQueueKey,
    queryFn: () => getChaseQueue(CHASING_QUEUE_LIMIT),
    retry: false,
  });

  const allItems = queueQuery.data?.items ?? [];
  const items = allItems.filter((item) => !skippedIds.has(item.invoice_id));
  const skippedItems = allItems.filter((item) => skippedIds.has(item.invoice_id));

  const maxPage = Math.ceil(skippedItems.length / SKIPPED_PAGE_SIZE) - 1;
  const currentPage = Math.min(skippedPage, Math.max(0, maxPage));

  useEffect(() => {
    if (currentPage !== skippedPage) {
      setSkippedPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skippedItems.length]);

  const paginatedSkipped = skippedItems.slice(
    currentPage * SKIPPED_PAGE_SIZE,
    (currentPage + 1) * SKIPPED_PAGE_SIZE,
  );

  async function invalidateQueues() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chasingQueueKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.chaseQueue }),
    ]);
  }

  const approveMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => postChases(invoiceIds),
    onSuccess: async (result, invoiceIds) => {
      setPendingIds((current) => {
        const next = new Set(current);
        for (const id of invoiceIds) next.delete(id);
        return next;
      });
      setItemErrors((current) => {
        const next = { ...current };
        for (const id of invoiceIds) delete next[id];
        return next;
      });
      await invalidateQueues();
      if (result.skipped.length === 0) {
        const word = result.queued === 1 ? "invoice" : "invoices";
        toast(`${result.queued} ${word} queued for chasing`);
        return;
      }
      toast(`${result.queued} queued. Skipped ${skippedLabel(result.skipped, allItems)}.`);
    },
    onError: (error, invoiceIds) => {
      setPendingIds((current) => {
        const next = new Set(current);
        for (const id of invoiceIds) next.delete(id);
        return next;
      });
      const fallback =
        invoiceIds.length === 1 ? "Couldn't queue that chase." : "Couldn't queue those chases.";
      const message = userFacingMessage(error, fallback);
      setItemErrors((current) => {
        const next = { ...current };
        for (const id of invoiceIds) next[id] = message;
        return next;
      });
    },
  });

  function approveOne(invoiceId: string) {
    setPendingIds((current) => new Set(current).add(invoiceId));
    approveMutation.mutate([invoiceId]);
  }

  function skipOne(invoiceId: string) {
    setSkippedIds((current) => new Set([...current, invoiceId]) as ReadonlySet<string>);
    if (expandedId === invoiceId) setExpandedId(null);
  }

  const isPendingFor = (invoiceId: string) => pendingIds.has(invoiceId);

  return (
    <div>
      {queueQuery.isPending ? <QueueSkeletons /> : null}

      {queueQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <p className="text-body font-semibold text-fg">
            {userFacingMessage(queueQuery.error, "Couldn't load the chase queue.")}
          </p>
          <AppButton
            variant="secondary"
            onClick={() => {
              void queueQuery.refetch();
            }}
          >
            Retry
          </AppButton>
        </div>
      ) : null}

      {!queueQuery.isPending && !queueQuery.isError && items.length === 0 ? <EmptyQueue /> : null}

      {!queueQuery.isPending && !queueQuery.isError && items.length > 0 ? (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ChaseCard
              key={item.invoice_id}
              item={item}
              expanded={expandedId === item.invoice_id}
              onExpand={() =>
                setExpandedId((current) => (current === item.invoice_id ? null : item.invoice_id))
              }
              sending={isPendingFor(item.invoice_id)}
              error={itemErrors[item.invoice_id]}
              onApprove={() => approveOne(item.invoice_id)}
              onSkip={() => skipOne(item.invoice_id)}
              bulkMutating={bulkMutating > 0}
            />
          ))}
        </div>
      ) : null}

      {skippedItems.length > 0 ? (
        <div className="mt-6 space-y-3">
          <h2 className="text-section font-bold tracking-tight text-fg">
            Skipped ({skippedItems.length})
          </h2>
          {paginatedSkipped.length > 0 ? (
            <div className="flex flex-col gap-2">
              {paginatedSkipped.map((item) => (
                <div
                  key={item.invoice_id}
                  className="rounded-card border border-hairline bg-card px-6 py-3"
                >
                  <div className="text-body font-semibold text-fg-soft">
                    {item.account_name} · {item.invoice_number}
                  </div>
                  <div className="tnum mt-0.5 text-prose text-fg-soft">
                    {formatDays(item.days_overdue)} overdue · {formatINR(item.amount_outstanding)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {skippedItems.length > SKIPPED_PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="text-prose text-fg-soft">
                Showing {currentPage * SKIPPED_PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * SKIPPED_PAGE_SIZE, skippedItems.length)} of{" "}
                {skippedItems.length}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSkippedPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="rounded-lg border border-hairline bg-card px-2 py-1 text-prose font-semibold text-fg-soft hover:text-fg disabled:opacity-50"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setSkippedPage(currentPage + 1)}
                  disabled={currentPage >= maxPage}
                  className="rounded-lg border border-hairline bg-card px-2 py-1 text-prose font-semibold text-fg-soft hover:text-fg disabled:opacity-50"
                >
                  ›
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Skeleton placeholders shown while the chase queue is loading. */
function QueueSkeletons() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading chase queue">
      {Array.from({ length: 4 }, (_, i) => (
        <AppSkeleton key={i} className="h-[88px] w-full" />
      ))}
    </div>
  );
}

/** Empty state shown when the queue has no eligible invoices. */
function EmptyQueue() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-hairline bg-card p-14 text-center">
      <div className="max-w-md">
        <h2 className="text-section font-bold text-fg">Nothing waiting for approval.</h2>
        <p className="mt-1.5 text-prose text-fg-soft">
          We'll queue messages here as invoices come due.
        </p>
      </div>
    </div>
  );
}

/** Queue row: collapsed summary or expanded detail view with approve/skip actions. */
function ChaseCard({
  item,
  expanded,
  onExpand,
  sending,
  error,
  onApprove,
  onSkip,
  bulkMutating,
}: {
  item: ChaseQueueItem;
  expanded: boolean;
  onExpand: () => void;
  sending: boolean;
  error: string | undefined;
  onApprove: () => void;
  onSkip: () => void;
  bulkMutating: boolean;
}) {
  const summary = (
    <div>
      <div className="text-body font-semibold text-fg">
        {item.account_name} · {item.invoice_number}
      </div>
      <div className="tnum mt-0.5 text-prose text-fg-soft">
        {formatDays(item.days_overdue)} overdue · {formatINR(item.amount_outstanding)}
      </div>
    </div>
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        className="flex w-full items-center justify-between gap-4 rounded-card border border-hairline bg-card px-6 py-4 text-left hover:bg-hovered"
      >
        <div className="flex items-center gap-3">
          <PriorityBadge band={item.priority_band} />
          {summary}
        </div>
        <span className="text-prose text-fg-soft">Expand</span>
      </button>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={true}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <PriorityBadge band={item.priority_band} />
          {summary}
        </button>
        {sending ? (
          <span
            role="status"
            aria-label="Sending"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-accent-edge border-t-accent"
          />
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-3.5 flex items-center justify-between gap-3 rounded-card border border-danger-edge bg-danger-tint px-4 py-3"
        >
          <p className="text-body font-semibold text-danger">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-[10px] bg-subtle p-4">
        <p className="text-body font-semibold text-fg">{item.priority_reason}</p>
      </div>

      <div className="mt-4 flex gap-2">
        <AppButton
          variant="primary"
          onClick={onApprove}
          loading={sending}
          disabled={sending || bulkMutating}
        >
          Approve
        </AppButton>
        <button
          type="button"
          onClick={onSkip}
          disabled={bulkMutating}
          className="rounded-pill px-1.5 py-2 text-body font-semibold text-fg-soft hover:text-fg disabled:opacity-50"
        >
          Skip this one
        </button>
      </div>
    </div>
  );
}
