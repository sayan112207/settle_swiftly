import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatDays, formatINR } from "@/lib/format";
import {
  DashboardApiError,
  dashboardQueryKeys,
  getChaseQueue,
  postChases,
} from "@/lib/services/dashboard";
import type { ChaseQueueItem, ChaseSkipped } from "@/lib/schemas/dashboard";

export const Route = createFileRoute("/app/chasing")({
  head: () => ({ meta: [{ title: `Chasing — ${PRODUCT_NAME}` }] }),
  component: ChasingPage,
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

/**
 * Only a `DashboardApiError` carries backend-authored, user-facing copy; any
 * other error (network drop, schema mismatch) falls back to the caller's own
 * message. Mirrors the identical helper in `dashboard.tsx` — this is display
 * formatting, not the eligibility/scoring rule, so it isn't shared code to
 * import, just the same convention repeated.
 */
function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof DashboardApiError ? error.message : fallback;
}

/** Renders the server's skip reasons against the invoice numbers the queue already has loaded, for the post-chase toast. */
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

/**
 * Chasing → Approval queue. Shows the same ranked chase queue as the
 * Dashboard widget (`GET /api/v1/dashboard/chase-queue`), requested at the
 * contract's full limit of 50, with a single-item Approve and a bulk
 * "Approve all" behind a confirmation dialog (`POST /api/v1/chases`).
 *
 * The `messages`, `cadences`, and `chase_events` tables are explicitly out of
 * scope for this build (see docs/api-contract.md) — sending the actual
 * reminder, per-recipient email content, editing, and cadence steps are a
 * later milestone with no backend support today. This screen deliberately
 * does not fabricate subject lines, email bodies, an edit/draft flow, or an
 * undo action for any of that, and the Cadence tab is shown but inert since
 * no such page exists yet.
 */
function ChasingPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skippedIds, setSkippedIds] = useState<ReadonlySet<string>>(new Set());
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const queueQuery = useQuery({
    queryKey: chasingQueueKey,
    queryFn: () => getChaseQueue(CHASING_QUEUE_LIMIT),
    retry: false,
  });

  const allItems = queueQuery.data?.items ?? [];
  const items = allItems.filter((item) => !skippedIds.has(item.invoice_id));

  async function invalidateQueues() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chasingQueueKey }),
      queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.chaseQueue }),
    ]);
  }

  const approveMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => postChases(invoiceIds),
    onSuccess: async (result, invoiceIds) => {
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
    approveMutation.mutate([invoiceId]);
  }

  function approveAll() {
    setApproveAllOpen(false);
    approveMutation.mutate(items.map((item) => item.invoice_id));
  }

  function skipOne(invoiceId: string) {
    setSkippedIds((current) => new Set(current).add(invoiceId));
    if (expandedId === invoiceId) setExpandedId(null);
  }

  const isPendingFor = (invoiceId: string) =>
    approveMutation.isPending && (approveMutation.variables ?? []).includes(invoiceId);

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
        {!queueQuery.isPending && !queueQuery.isError && items.length > 0 ? (
          <AppButton variant="primary" onClick={() => setApproveAllOpen(true)}>
            Approve all {items.length}
          </AppButton>
        ) : null}
      </div>

      <ChasingTabs />

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
            />
          ))}
        </div>
      ) : null}

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

/**
 * Approval queue / Cadence tab bar. Only "Approval queue" is a real
 * destination today — there is no `cadences` backend support (see
 * docs/api-contract.md), so "Cadence" is shown per the design but rendered
 * inert rather than linking to a page that doesn't exist.
 */
function ChasingTabs() {
  return (
    <div
      role="tablist"
      aria-label="Chasing sections"
      className="mb-5 flex gap-7 border-b border-hairline"
    >
      <span
        role="tab"
        aria-selected="true"
        className="border-b-2 border-accent-line pb-3 text-body font-semibold text-fg"
      >
        Approval queue
      </span>
      <span
        role="tab"
        aria-selected="false"
        aria-disabled="true"
        title="Cadence isn't available yet."
        className="cursor-not-allowed border-b-2 border-transparent pb-3 text-body font-semibold text-fg-muted"
      >
        Cadence
      </span>
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

/** Shown when the queue has no eligible invoices left to approve. */
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

/**
 * One queue row. Collapsed, it's a single clickable summary; expanded, it
 * shows the backend-composed `priority_reason` plus Approve/Skip actions.
 * There is no subject/body editor here — `messages` isn't a backed concept
 * yet, so nothing is shown that the app can't actually send or persist.
 */
function ChaseCard({
  item,
  expanded,
  onExpand,
  sending,
  error,
  onApprove,
  onSkip,
}: {
  item: ChaseQueueItem;
  expanded: boolean;
  onExpand: () => void;
  sending: boolean;
  error: string | undefined;
  onApprove: () => void;
  onSkip: () => void;
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
        <AppButton variant="primary" onClick={onApprove} loading={sending}>
          Approve
        </AppButton>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-pill px-1.5 py-2 text-body font-semibold text-fg-soft hover:text-fg"
        >
          Skip this one
        </button>
      </div>
    </div>
  );
}
