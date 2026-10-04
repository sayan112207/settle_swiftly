import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState, type ReactNode } from "react";
import { z } from "zod";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { DataTable, type Column } from "@/components/app/DataTable";
import { DsoChart } from "@/components/app/DsoChart";
import { MetricTile } from "@/components/app/MetricTile";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatDays, formatINR } from "@/lib/format";
import type {
  AgedDebtItem,
  AtRiskItem,
  CallListItem,
  ReadyWeeklyReport,
  WeeklyReport,
} from "@/lib/schemas/reports";
import { DashboardApiError, dashboardQueryKeys, postChases } from "@/lib/services/dashboard";
import {
  getWeeklyReport,
  REPORTS_NOT_AVAILABLE,
  ReportsApiError,
  reportsQueryKeys,
} from "@/lib/services/reports";
import {
  agedDebtSummary,
  chaseOutcomeMessage,
  collectedDirection,
  reportFileName,
  reportToCsv,
} from "@/lib/services/reports-rules";
import { cn } from "@/lib/utils";

/**
 * `?aged=all` keeps the expanded aged-debt list across a reload or a shared
 * link. Anything else (a typo, a stale bookmark) falls back to the collapsed
 * list instead of failing the route.
 */
const reportsSearchSchema = z.object({
  aged: z.enum(["all"]).optional().catch(undefined),
});

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: `Reports — ${PRODUCT_NAME}` }] }),
  validateSearch: reportsSearchSchema,
  component: ReportsPage,
});

/** Rows the aged-debt table shows before "Show all". */
const AGED_PREVIEW_LIMIT = 10;

/**
 * Hover copy for row actions that have no backend yet. They stay visible
 * because the design has them, and disabled because a button that does
 * nothing is a dead click.
 */
const COMING_SOON = "Coming soon";

/** Why a row chased from this page can't be chased again in the same visit. */
const QUEUED = "Already queued";

/**
 * The copy to show a person for a failed request. Only the API's own envelope
 * carries a message written for users; anything else gets the screen's copy.
 */
function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof ReportsApiError || error instanceof DashboardApiError
    ? error.message
    : fallback;
}

/** Whether Retry can help: not for an endpoint that isn't built yet. */
function isRetryable(error: unknown): boolean {
  return !(error instanceof ReportsApiError && error.code === REPORTS_NOT_AVAILABLE);
}

/**
 * Hands the report to the browser as a CSV download.
 *
 * The BOM is there for Excel, which otherwise opens UTF-8 as Windows-1252 and
 * turns every en dash in "1–30" into mojibake.
 *
 * The anchor is attached before the click because Firefox ignores clicks on
 * detached anchors, and the URL is revoked on the next tick because revoking
 * synchronously can cancel a download that has not started reading the blob.
 */
function downloadReport(report: ReadyWeeklyReport): void {
  try {
    const blob = new Blob(["﻿", reportToCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reportFileName(report);
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error(error);
    toast("Couldn't download the report.");
  }
}

/**
 * Whether a week has been reported yet. A named guard because inline
 * `report.has_report` does not narrow the zod-inferred union here.
 */
function isReady(report: WeeklyReport): report is ReadyWeeklyReport {
  return report.has_report;
}

/** The weekly report: what came in, what's at risk, and who to call. */
function ReportsPage() {
  const reportQuery = useQuery({
    queryKey: reportsQueryKeys.weekly,
    queryFn: () => getWeeklyReport(),
    retry: false,
  });

  const report = reportQuery.data;
  const ready = report !== undefined && isReady(report) ? report : undefined;

  return (
    <div aria-busy={reportQuery.isPending || undefined}>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-title font-bold tracking-tight text-fg">Reports</h1>
        {ready ? (
          <AppButton variant="secondary" onClick={() => downloadReport(ready)}>
            Download this report
          </AppButton>
        ) : null}
      </header>

      {/* Data before error: a background refetch (window focus, reconnect)
          that fails keeps the last good report on screen with a note, rather
          than replacing a report the user is reading with an error card. */}
      {reportQuery.isPending ? (
        <ReportSkeletons />
      ) : report === undefined ? (
        <Panel>
          <p role="alert" className="text-body font-semibold text-fg">
            {userFacingMessage(reportQuery.error, "Couldn't build this week's report.")}
          </p>
          {isRetryable(reportQuery.error) ? (
            <AppButton
              variant="secondary"
              className="mt-3"
              loading={reportQuery.isFetching}
              onClick={() => void reportQuery.refetch()}
            >
              Retry
            </AppButton>
          ) : null}
        </Panel>
      ) : ready ? (
        <>
          {reportQuery.isError ? (
            <div className="mb-4 flex items-center gap-3">
              <p role="alert" className="text-body font-semibold text-fg">
                {userFacingMessage(
                  reportQuery.error,
                  "Couldn't refresh this report. Showing the last copy.",
                )}
              </p>
              <AppButton
                variant="secondary"
                loading={reportQuery.isFetching}
                onClick={() => void reportQuery.refetch()}
              >
                Retry
              </AppButton>
            </div>
          ) : null}
          <ReportBody report={ready} />
        </>
      ) : (
        <Panel>
          <div className="max-w-md">
            <h2 className="text-section font-bold tracking-tight text-fg">
              Your first report lands next Monday.
            </h2>
            <p className="mt-1.5 text-prose font-normal text-fg-soft">
              We'll show what came in, what's at risk, and who to call.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** A centred card for the page-level error and first-run states. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-hairline bg-card px-5 py-14 text-center">
      {children}
    </div>
  );
}

/** Skeletons occupy the final tile row and chart so nothing shifts on arrival. */
function ReportSkeletons() {
  return (
    <>
      <span className="sr-only">Loading report</span>
      <div className={cn(TILE_GRID, "mb-6")}>
        {TILE_SKELETON_KEYS.map((key) => (
          <div key={key} className="rounded-card border border-hairline bg-card px-5 py-4">
            <AppSkeleton className="h-3 w-24" />
            <AppSkeleton className="mt-2 h-7 w-32" />
            <AppSkeleton className="mt-1 h-3 w-28" />
          </div>
        ))}
      </div>
      <AppSkeleton className="h-55 w-full rounded-card" />
    </>
  );
}

const TILE_SKELETON_KEYS = ["collected", "dso", "messages", "hours"] as const;

/**
 * Four across on desktop, then two, then one, at the project's breakpoints.
 * Shared by the tiles and their skeletons so loading cannot shift the layout.
 */
const TILE_GRID = "grid grid-cols-4 gap-4 max-[900px]:grid-cols-2 max-[520px]:grid-cols-1";

/** Everything below the header once a report exists. */
function ReportBody({ report }: { report: ReadyWeeklyReport }) {
  return (
    <>
      <TileRow report={report} />

      <section className="mt-6">
        <SectionHeading>Days sales outstanding</SectionHeading>
        <DsoChart series={report.dso_series} />
      </section>

      {/* Side by side only where both tables fit without squeezing the notes
          into a sliver; below that they stack at full width. */}
      <div className="mt-6 grid gap-6 2xl:grid-cols-2 2xl:gap-5">
        <section className="min-w-0">
          <SectionHeading>At risk next week</SectionHeading>
          <TableOrEmpty empty="Nothing tips into a worse bucket next week.">
            {report.at_risk.length > 0 ? <AtRiskTable rows={report.at_risk} /> : null}
          </TableOrEmpty>
        </section>
        <section className="min-w-0">
          <SectionHeading>Who to call on Monday</SectionHeading>
          <TableOrEmpty empty="No calls needed this week.">
            {report.call_list.length > 0 ? <CallListTable rows={report.call_list} /> : null}
          </TableOrEmpty>
        </section>
      </div>

      <AgedDebtSection rows={report.aged_debt} />
    </>
  );
}

/** Section `<h2>` in the shared type scale. */
function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-section font-bold tracking-tight text-fg">{children}</h2>;
}

/** A table, or a written empty state in the same card when there are no rows. */
function TableOrEmpty({ children, empty }: { children: ReactNode; empty: string }) {
  if (children !== null) {
    return (
      <div className="overflow-hidden rounded-card border border-hairline bg-card">{children}</div>
    );
  }
  return (
    <div className="rounded-card border border-hairline bg-card px-5 py-10 text-center text-body font-semibold text-fg">
      {empty}
    </div>
  );
}

/** The four headline numbers for the week. */
function TileRow({ report }: { report: ReadyWeeklyReport }) {
  const { tiles } = report;
  const direction = collectedDirection(tiles.collected_this_week, tiles.collected_last_week);

  return (
    <div className={TILE_GRID}>
      <MetricTile
        to="/app/payments"
        eyebrow="Collected this week"
        value={formatINR(tiles.collected_this_week)}
        subline={`${direction} ${formatINR(tiles.collected_last_week)} last week`}
      />
      <MetricTile
        eyebrow="DSO"
        value={formatDays(tiles.dso_days)}
        subline={`${formatDays(tiles.dso_at_signup_days)} at signup`}
      />
      <MetricTile
        to="/app/chasing"
        eyebrow="Messages sent"
        value={String(tiles.messages_sent)}
        subline={`${tiles.messages_approved_manually} approved manually`}
      />
      <MetricTile
        eyebrow="Hours saved (estimated)"
        value={tiles.hours_saved_estimate.toFixed(1)}
        subline="based on manual chase time"
      />
    </div>
  );
}

/** Links an account name to its detail page, truncating long names. */
function AccountLink({ accountId, name }: { accountId: string; name: string }) {
  return (
    <Link
      to="/app/accounts/$accountId"
      params={{ accountId }}
      title={name}
      className="block max-w-xs truncate font-semibold text-fg underline-offset-2 hover:text-accent hover:underline"
    >
      {name}
    </Link>
  );
}

const AT_RISK_COLUMNS: readonly Column<AtRiskItem>[] = [
  {
    id: "account",
    header: "Account",
    cell: (row) => <AccountLink accountId={row.account_id} name={row.account_name} />,
  },
  {
    id: "invoice",
    header: "Invoice",
    cell: (row) => <span className="font-normal text-fg-soft">{row.invoice_number}</span>,
  },
  {
    id: "amount",
    header: "Amount",
    align: "right",
    cell: (row) => <span className="tnum">{formatINR(row.amount_outstanding)}</span>,
  },
  {
    id: "bucket",
    header: "Bucket",
    wrap: true,
    cell: (row) => (
      <span className="text-prose font-normal text-fg-soft">
        {row.bucket} · {row.note}
      </span>
    ),
  },
];

/** Invoices that move into a worse aging bucket in the next seven days. */
function AtRiskTable({ rows }: { rows: readonly AtRiskItem[] }) {
  return <DataTable columns={AT_RISK_COLUMNS} rows={rows} rowKey={(row) => row.invoice_id} />;
}

const CALL_LIST_COLUMNS: readonly Column<CallListItem>[] = [
  {
    id: "account",
    header: "Account",
    cell: (row) => <AccountLink accountId={row.account_id} name={row.account_name} />,
  },
  {
    id: "reason",
    header: "Reason",
    wrap: true,
    cell: (row) => <span className="text-prose font-normal text-fg-soft">{row.reason}</span>,
  },
];

/** Accounts worth a phone call rather than another reminder. */
function CallListTable({ rows }: { rows: readonly CallListItem[] }) {
  return <DataTable columns={CALL_LIST_COLUMNS} rows={rows} rowKey={(row) => row.account_id} />;
}

/**
 * The 90+ list with its row actions and running total.
 *
 * Chase is the one action with a backend today (`POST /api/v1/chases`, shared
 * with the dashboard). Payment plan, Escalate and Write off are shown disabled
 * with "Coming soon" until their endpoints exist.
 */
function AgedDebtSection({ rows }: { rows: readonly AgedDebtItem[] }) {
  const { aged } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  // Invoices chased from this page in this visit, with why they can't be
  // chased again: queued, or skipped by the server (paid or disputed since the
  // report was built). The weekly report is a snapshot and won't drop them
  // until next week's, so without this a second click sends a second reminder.
  const [settled, setSettled] = useState<ReadonlyMap<string, string>>(() => new Map());

  const chaseMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => postChases(invoiceIds),
    onSuccess: async (result, invoiceIds) => {
      const invoiceId = invoiceIds[0];
      const skipped = result.skipped[0];
      const blockedBy =
        skipped !== undefined ? skipped.reason : result.queued > 0 ? QUEUED : undefined;
      if (invoiceId !== undefined && blockedBy !== undefined) {
        setSettled((previous) => new Map(previous).set(invoiceId, blockedBy));
      }
      const invoice = rows.find((row) => row.invoice_id === invoiceId)?.invoice_number;
      toast(chaseOutcomeMessage(result, invoice ?? "That invoice"));
      // After the toast: a failed refetch of the dashboard queue must not
      // swallow the confirmation of a chase that did go out.
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.chaseQueue });
    },
    onError: (error) => {
      toast(userFacingMessage(error, "Couldn't queue that chase."));
    },
  });

  const showAll = aged === "all";
  const visible = showAll ? rows : rows.slice(0, AGED_PREVIEW_LIMIT);
  const { total, accountCount } = agedDebtSummary(rows);
  const pendingId = chaseMutation.isPending ? chaseMutation.variables?.[0] : undefined;

  const columns: readonly Column<AgedDebtItem>[] = [
    {
      id: "account",
      header: "Account",
      cell: (row) => <AccountLink accountId={row.account_id} name={row.account_name} />,
    },
    {
      id: "invoice",
      header: "Invoice",
      cell: (row) => <span className="font-normal text-fg-soft">{row.invoice_number}</span>,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => <span className="tnum text-danger">{formatINR(row.amount_outstanding)}</span>,
    },
    {
      id: "days",
      header: "Days",
      align: "right",
      cell: (row) => (
        <span className="tnum font-normal text-fg-soft">{formatDays(row.days_overdue)}</span>
      ),
    },
    {
      id: "action",
      header: "Action",
      cell: (row) => {
        const settledAs = settled.get(row.invoice_id);
        const blockedBy = row.chase_disabled_reason ?? settledAs ?? null;
        return (
          <div className="-ml-2 flex items-center gap-0.5">
            <AppButton
              variant="text"
              loading={pendingId === row.invoice_id}
              disabled={blockedBy !== null || chaseMutation.isPending}
              title={blockedBy ?? undefined}
              aria-label={
                blockedBy
                  ? `Chase ${row.invoice_number} (disabled: ${blockedBy})`
                  : `Chase ${row.invoice_number}`
              }
              onClick={() => chaseMutation.mutate([row.invoice_id])}
            >
              <span className="text-prose">{settledAs === QUEUED ? "Queued" : "Chase"}</span>
            </AppButton>
            <ComingSoonAction label="Payment plan" invoice={row.invoice_number} />
            <ComingSoonAction label="Escalate" invoice={row.invoice_number} />
            <ComingSoonAction label="Write off" invoice={row.invoice_number} tone="danger" />
          </div>
        );
      },
    },
  ];

  return (
    <section className="mt-6">
      <SectionHeading>90+ days aged debt</SectionHeading>
      {rows.length === 0 ? (
        <div className="rounded-card border border-hairline bg-card px-5 py-10 text-center text-body font-semibold text-fg">
          Nothing over 90 days.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-hairline bg-card">
            <DataTable columns={columns} rows={visible} rowKey={(row) => row.invoice_id} />
          </div>
          {rows.length > AGED_PREVIEW_LIMIT ? (
            <AppButton
              variant="text"
              className="mt-1 -ml-2"
              onClick={() =>
                void navigate({ search: showAll ? {} : { aged: "all" }, replace: true })
              }
            >
              <span className="text-prose">
                {showAll ? "Show fewer" : `Show all ${rows.length}`}
              </span>
            </AppButton>
          ) : null}
          <p className="tnum mt-2 text-prose font-normal text-fg-soft">
            {formatINR(total)} across {accountCount} {accountCount === 1 ? "account" : "accounts"}
          </p>
        </>
      )}
    </section>
  );
}

/** A row action whose endpoint doesn't exist yet: visible, disabled, explained. */
function ComingSoonAction({
  label,
  invoice,
  tone = "muted",
}: {
  label: string;
  invoice: string;
  tone?: "muted" | "danger";
}) {
  return (
    <AppButton
      variant="text"
      disabled
      title={COMING_SOON}
      aria-label={`${label} ${invoice} (${COMING_SOON.toLowerCase()})`}
      // Colour only: `cn` treats the size token as a colour and would drop one
      // of them, so the size sits on the inner span.
      className={
        tone === "danger" ? "text-danger hover:text-danger" : "text-fg-soft hover:text-fg-soft"
      }
    >
      <span className="text-prose">{label}</span>
    </AppButton>
  );
}
