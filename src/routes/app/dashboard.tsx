import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AgingBar } from "@/components/app/AgingBar";
import { AppButton } from "@/components/app/AppButton";
import { AppCheckbox } from "@/components/app/AppCheckbox";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { BulkBar } from "@/components/app/BulkBar";
import { DataTable, type Column } from "@/components/app/DataTable";
import { SettleLoader } from "@/components/app/SettleLoader";
import { MetricTile } from "@/components/app/MetricTile";
import { PriorityBadge } from "@/components/app/PriorityBadge";
import { PRODUCT_NAME } from "@/lib/brand";
import { usePageLoader } from "@/lib/hooks/usePageLoader";
import {
  formatDays,
  formatFirstName,
  formatGreeting,
  formatINR,
  formatLongDate,
  formatTimeOfDay,
  isZeroMoney,
} from "@/lib/format";
import type { ChaseQueueItem, ChaseSkipped, DashboardSummary } from "@/lib/schemas/dashboard";
import {
  DashboardApiError,
  dashboardQueryKeys,
  getChaseQueue,
  getSummary,
  postChases,
} from "@/lib/services/dashboard";

/**
 * The QueryClient lives on the router and is provided from `__root`. These two
 * queries share nothing except that they render on the same page — they start
 * together and fail separately, so a dead summary cannot blank a live queue.
 */
export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: `Dashboard — ${PRODUCT_NAME}` }] }),
  component: DashboardPage,
});

/**
 * Spec §6: an empty queue is "everything is 90+" when that bucket holds the
 * whole book. `share_pct` is rounded to one decimal, so 100 is not a reliable
 * signal — a fully aged book can arrive as 99.9 and the cheerful empty copy
 * would then claim the book is current.
 *
 * Every other bucket being zero-money is the same fact without the rounding.
 * A 90+ of zero is an empty book, not an aged one.
 */
function isAllAged(summary: DashboardSummary): boolean {
  const oldest = summary.aging.find((segment) => segment.bucket === "90+");
  if (oldest === undefined || isZeroMoney(oldest.amount)) return false;
  return summary.aging.every((segment) => segment.bucket === "90+" || isZeroMoney(segment.amount));
}

/**
 * The copy to show a person for a failed request.
 *
 * Only a `DashboardApiError` carries a message the backend wrote for a user;
 * the contract says to render that verbatim. Every other error — a dropped
 * connection, a schema mismatch, a 5xx that skipped the error envelope — has a
 * message written for whoever is reading the console, so the caller's own copy
 * is shown instead. The service logs the detail before it throws.
 */
function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof DashboardApiError ? error.message : fallback;
}

/** The dashboard: totals, aging, attention items and the chase queue, behind a page-level loader on first load. */
function DashboardPage() {
  const { user } = Route.useRouteContext();
  const firstName = formatFirstName(user.displayName);
  const greeting = formatGreeting();

  const summaryQuery = useQuery({
    queryKey: dashboardQueryKeys.summary,
    queryFn: () => getSummary(),
    retry: false,
  });
  const queueQuery = useQuery({
    queryKey: dashboardQueryKeys.chaseQueue,
    queryFn: () => getChaseQueue(),
    retry: false,
  });

  const summary = summaryQuery.data;
  const asOf = summary?.as_of ?? null;
  const busy = summaryQuery.isPending || queueQuery.isPending;
  // Page-level wait: only while both requests are outstanding. Once either has
  // answered, the sections below handle their own skeletons and errors.
  const loader = usePageLoader(
    summaryQuery.isPending && queueQuery.isPending,
    false,
    // Only a fully successful page gets the tick. If either request failed or
    // is still pending, show the sections straight away (Retry alerts, own
    // skeletons) instead of announcing "loaded" over unfinished content.
    summaryQuery.isError || queueQuery.isError || summaryQuery.isPending || queueQuery.isPending,
  );

  return (
    <div aria-busy={busy || undefined}>
      <header className="mb-6">
        <h1 className="text-title font-bold tracking-tight text-fg" suppressHydrationWarning>
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
        {asOf ? (
          <p className="mt-1 text-prose font-normal text-fg-soft">
            {formatLongDate(asOf)} · Last synced at {formatTimeOfDay(asOf)}
          </p>
        ) : (
          <p className="mt-1 text-prose font-normal text-fg-soft">&nbsp;</p>
        )}
      </header>

      {loader.status ? (
        <div className="flex min-h-64 items-center justify-center">
          <SettleLoader status={loader.status} label="dashboard" onExited={loader.onExited} />
        </div>
      ) : (
        <>
          {summaryQuery.isPending ? (
            <SummarySkeletons />
          ) : summaryQuery.isError ? (
            <>
              <div className="mb-4 flex items-center gap-3">
                <p role="alert" className="text-body font-semibold text-fg">
                  {userFacingMessage(summaryQuery.error, "Couldn't load your totals.")}
                </p>
                <AppButton variant="secondary" onClick={() => void summaryQuery.refetch()}>
                  Retry
                </AppButton>
              </div>
              <TileRow summary={null} />
            </>
          ) : summary ? (
            <>
              <TileRow summary={summary} />
              <section className="mt-8">
                <h2 className="mb-4 text-section font-bold tracking-tight text-fg">
                  Where the money is sitting
                </h2>
                <AgingBar segments={summary.aging} />
              </section>
              <AttentionRow summary={summary} />
            </>
          ) : null}

          <ChaseNowSection
            summary={summary}
            items={queueQuery.data?.items}
            isPending={queueQuery.isPending}
            error={queueQuery.isError ? queueQuery.error : undefined}
            onRetry={() => void queueQuery.refetch()}
          />
        </>
      )}
    </div>
  );
}

function TileRow({ summary }: { summary: DashboardSummary | null }) {
  const dash = summary === null;
  return (
    <div className="grid grid-cols-4 gap-4">
      <MetricTile
        to="/app/accounts"
        eyebrow="Total outstanding"
        value={dash ? "—" : formatINR(summary.tiles.total_outstanding)}
        subline={dash ? "\u00a0" : `${summary.tiles.account_count} accounts`}
      />
      <MetricTile
        to="/app/invoices"
        search={{ status: "overdue" }}
        eyebrow="Overdue"
        value={dash ? "—" : formatINR(summary.tiles.overdue)}
        subline={dash ? "\u00a0" : `${summary.tiles.overdue_share_pct.toFixed(1)}% of book`}
        tone="danger"
      />
      <MetricTile
        to="/app/invoices"
        eyebrow="Open invoices"
        value={dash ? "—" : String(summary.tiles.open_invoice_count)}
        subline={dash ? "\u00a0" : `across ${summary.tiles.account_count} accounts`}
      />
      <MetricTile
        to="/app/accounts"
        search={{ filter: "missing_contacts" }}
        eyebrow="Missing contacts"
        value={dash ? "—" : String(summary.tiles.missing_contact_account_count)}
        subline={dash ? "\u00a0" : "accounts can't be chased"}
      />
    </div>
  );
}

/** Needs your attention: each count links to the list that fixes it. */
function AttentionRow({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-section font-bold tracking-tight text-fg">Needs your attention</h2>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricTile
          to="/app/accounts"
          search={{ filter: "missing_contacts" }}
          value={String(summary.attention.accounts_without_p0)}
          subline="accounts with no P0 contact"
        />
        <MetricTile
          to="/app/invoices"
          search={{ status: "disputed" }}
          value={String(summary.attention.disputes_open)}
          subline={summary.attention.disputes_open === 1 ? "dispute raised" : "disputes raised"}
        />
        <MetricTile
          to="/app/invoices"
          search={{ status: "promise-broken" }}
          value={String(summary.attention.promises_broken_this_week)}
          subline="promises broken this week"
        />
        <MetricTile
          to="/app/chasing/outbox"
          search={{ view: "attention" }}
          value={String(summary.attention.delivery_alerts_open)}
          subline={
            summary.attention.delivery_alerts_open === 1
              ? "delivery alert to review"
              : "delivery alerts to review"
          }
        />
      </div>
    </section>
  );
}

/**
 * Spec §6 enumerates three skeleton regions. The attention strip is not in
 * that list, but omitting it would drop the Chase now block by a card-row when
 * data arrives, which is the layout shift the same paragraph forbids. Four
 * card skeletons occupy the strip's final size; they are not extra chrome.
 */
function SummarySkeletons() {
  return (
    <>
      <span className="sr-only">Loading totals</span>
      <div className="grid grid-cols-4 gap-4">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </div>
      <section className="mt-8">
        <h2 className="mb-4 text-section font-bold tracking-tight text-fg">
          Where the money is sitting
        </h2>
        <AgingBarSkeleton />
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-section font-bold tracking-tight text-fg">Needs your attention</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <TileSkeleton eyebrow={false} />
          <TileSkeleton eyebrow={false} />
          <TileSkeleton eyebrow={false} />
          <TileSkeleton eyebrow={false} />
        </div>
      </section>
    </>
  );
}

function QueueSkeletons() {
  return <DataTable columns={SKELETON_COLUMNS} rows={SKELETON_ROWS} rowKey={(row) => row.id} />;
}

function TileSkeleton({ eyebrow = true }: { eyebrow?: boolean }) {
  return (
    <div className="rounded-card border border-hairline bg-card px-5 py-4">
      {eyebrow ? <AppSkeleton className="h-3 w-24" /> : null}
      <AppSkeleton className={eyebrow ? "mt-2 h-7 w-32" : "h-7 w-16"} />
      <AppSkeleton className="mt-1 h-3 w-28" />
    </div>
  );
}

function AgingBarSkeleton() {
  return (
    <div>
      <AppSkeleton className="h-2.5 w-full rounded-pill" />
      <div className="mt-3 grid grid-cols-5 gap-4">
        {AGING_SKELETON_KEYS.map((key) => (
          <div key={key}>
            <AppSkeleton className="h-3 w-16" />
            <AppSkeleton className="mt-1 h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

const AGING_SKELETON_KEYS = ["none", "30", "60", "90", "over"] as const;

const SKELETON_ROWS = [
  { id: "s1" },
  { id: "s2" },
  { id: "s3" },
  { id: "s4" },
  { id: "s5" },
  { id: "s6" },
] as const;

const SKELETON_COLUMNS: readonly Column<(typeof SKELETON_ROWS)[number]>[] = [
  {
    id: "select",
    header: "Select",
    headerHidden: true,
    cell: () => <AppSkeleton className="size-4" />,
  },
  { id: "account", header: "Account", cell: () => <AppSkeleton className="h-3.5 w-40" /> },
  { id: "invoice", header: "Invoice", cell: () => <AppSkeleton className="h-3.5 w-16" /> },
  {
    id: "amount",
    header: "Amount",
    align: "right",
    cell: () => <AppSkeleton className="ml-auto h-3.5 w-20" />,
  },
  {
    id: "overdue",
    header: "Overdue",
    align: "right",
    cell: () => <AppSkeleton className="ml-auto h-3.5 w-16" />,
  },
  {
    id: "priority",
    header: "Priority",
    cell: () => <AppSkeleton className="h-5 w-20 rounded-pill" />,
  },
  { id: "reason", header: "Reason", cell: () => <AppSkeleton className="h-3.5 w-48" /> },
  {
    id: "action",
    header: "",
    headerHidden: true,
    cell: () => <AppSkeleton className="ml-auto h-3.5 w-12" />,
  },
];

function ChaseNowSection({
  summary,
  items,
  isPending,
  error,
  onRetry,
}: {
  summary: DashboardSummary | undefined;
  items: readonly ChaseQueueItem[] | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const emptyKind =
    items !== undefined && items.length === 0 && summary !== undefined
      ? isAllAged(summary)
        ? "aged"
        : "current"
      : undefined;

  return (
    <section className="mt-8">
      <h2 className="text-section font-bold tracking-tight text-fg">Chase now</h2>
      <p className="mt-1 mb-4 text-prose font-normal text-fg-soft">
        Ranked by what's most worth chasing today
      </p>
      {isPending ? (
        <QueueSkeletons />
      ) : error !== undefined ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-body font-semibold text-fg">
            {userFacingMessage(error, "Couldn't load the chase queue.")}
          </p>
          <AppButton variant="secondary" onClick={onRetry}>
            Retry
          </AppButton>
        </div>
      ) : emptyKind === "current" && summary !== undefined ? (
        <EmptyCurrent total={summary.tiles.total_outstanding} />
      ) : emptyKind === "aged" ? (
        <EmptyAged />
      ) : items !== undefined && items.length > 0 ? (
        <ChaseTable key={items.map((item) => item.invoice_id).join(",")} items={items} />
      ) : null}
    </section>
  );
}

function EmptyCurrent({ total }: { total: string }) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <EmptyCheckIcon />
      <h3 className="mt-4 text-section font-bold tracking-tight text-fg">
        Nothing overdue. All {formatINR(total)} is current.
      </h3>
      <p className="mt-2 text-prose font-normal text-fg-soft">
        We'll start chasing again the moment something slips.
      </p>
    </div>
  );
}

function EmptyAged() {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <h3 className="text-section font-bold tracking-tight text-fg">
        Nothing in the chase queue — everything is over 90 days old.
      </h3>
      <Link
        to="/app/reports"
        className="mt-3 inline-block text-body font-semibold text-accent hover:text-accent-hover"
      >
        Reports
      </Link>
    </div>
  );
}

/**
 * 40px, stroke 1.6, muted — spec §6. Inline rather than a lucide icon because
 * lucide's default stroke is 2 and its size-4 override on buttons does not
 * apply here, but matching 1.6 exactly is cheaper as three paths than as a
 * library default plus an override.
 */
function EmptyCheckIcon() {
  return (
    <svg
      className="mx-auto size-10 text-fg-muted"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M13 20.5 17.5 25 27 15.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function skippedLabel(skipped: readonly ChaseSkipped[], items: readonly ChaseQueueItem[]): string {
  return skipped
    .map((entry) => {
      const row = items.find((item) => item.invoice_id === entry.invoice_id);
      const invoice = row?.invoice_number ?? entry.invoice_id;
      return `${invoice} (${entry.reason})`;
    })
    .join(", ");
}

function ChaseTable({ items }: { items: readonly ChaseQueueItem[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(items.slice(0, 3).map((item) => item.invoice_id)),
  );

  const chaseMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => postChases(invoiceIds),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.chaseQueue });
      if (result.skipped.length === 0) {
        const word = result.queued === 1 ? "invoice" : "invoices";
        toast(`${result.queued} ${word} queued`);
        return;
      }
      toast(`${result.queued} queued. Skipped ${skippedLabel(result.skipped, items)}.`);
    },
    onError: (error, invoiceIds) => {
      // Every failure gets a toast, not just the ones that arrived in the error
      // envelope: without this the button spins, stops, and nothing changes.
      const fallback =
        invoiceIds.length === 1 ? "Couldn't queue that chase." : "Couldn't queue those chases.";
      toast(userFacingMessage(error, fallback));
    },
  });

  const allSelected = items.length > 0 && selected.size === items.length;
  const headerChecked = allSelected ? true : selected.size === 0 ? false : "indeterminate";
  const pendingIds = chaseMutation.isPending ? (chaseMutation.variables ?? []) : [];
  const bulkPending =
    pendingIds.length > 0 &&
    pendingIds.length === selected.size &&
    pendingIds.every((id) => selected.has(id));

  function toggleRow(invoiceId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) =>
      previous.size === items.length
        ? new Set<string>()
        : new Set(items.map((item) => item.invoice_id)),
    );
  }

  const columns: readonly Column<ChaseQueueItem>[] = [
    {
      id: "select",
      header: "Select",
      headerHidden: true,
      headerCell: () => (
        <AppCheckbox
          checked={headerChecked}
          onCheckedChange={toggleAll}
          aria-label="Select all invoices"
        />
      ),
      cell: (row) => (
        <AppCheckbox
          checked={selected.has(row.invoice_id)}
          onCheckedChange={() => toggleRow(row.invoice_id)}
          aria-label={`Select invoice ${row.invoice_number}`}
        />
      ),
    },
    { id: "account", header: "Account", text: (row) => row.account_name, truncateAt: "xs" },
    { id: "invoice", header: "Invoice", text: (row) => row.invoice_number },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      text: (row) => formatINR(row.amount_outstanding),
    },
    {
      id: "overdue",
      header: "Overdue",
      align: "right",
      text: (row) => (row.days_overdue > 0 ? formatDays(row.days_overdue) : "Not yet due"),
    },
    {
      id: "priority",
      header: "Priority",
      cell: (row) => <PriorityBadge band={row.priority_band} />,
    },
    { id: "reason", header: "Reason", text: (row) => row.priority_reason, truncateAt: "sm" },
    {
      id: "action",
      header: "",
      headerHidden: true,
      align: "right",
      cell: (row) => (
        <AppButton
          variant="text"
          className="row-action ml-auto"
          loading={pendingIds.length === 1 && pendingIds[0] === row.invoice_id}
          disabled={chaseMutation.isPending}
          onClick={() => chaseMutation.mutate([row.invoice_id])}
        >
          Chase
        </AppButton>
      ),
    },
  ];

  return (
    <>
      <BulkBar
        count={selected.size}
        loading={bulkPending}
        onChase={() => chaseMutation.mutate([...selected])}
      />
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.invoice_id}
        isRowSelected={(row) => selected.has(row.invoice_id)}
      />
    </>
  );
}
