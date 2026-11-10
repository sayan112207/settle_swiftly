import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppCheckbox } from "@/components/app/AppCheckbox";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { DataTable, type Column } from "@/components/app/DataTable";
import { QueryNotice } from "@/components/app/QueryNotice";
import { formatDays, formatINR, formatShortDate } from "@/lib/format";
import type { EligibleInvoice, EligibleResponse } from "@/lib/schemas/legal";
import { getEligible, legalQueryKeys } from "@/lib/services/legal";
import {
  eligibleSummary,
  routeCount,
  selectableIds,
  selectionSummary,
  serialiseInvoiceIds,
} from "@/lib/services/legal-rules";

export const Route = createFileRoute("/app/legal/")({
  component: EligiblePage,
});

/** Invoices past 90 days and four follow-ups, with what can be done about each. */
function EligiblePage() {
  const eligibleQuery = useQuery({
    queryKey: legalQueryKeys.eligible,
    queryFn: () => getEligible(),
    retry: false,
  });

  if (eligibleQuery.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <AppSkeleton className="h-14 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <AppSkeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (eligibleQuery.isError) {
    return (
      <QueryNotice
        error={eligibleQuery.error}
        fallback="Couldn't load eligible invoices."
        onRetry={() => void eligibleQuery.refetch()}
      />
    );
  }
  if (eligibleQuery.data.items.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-card px-5 py-16 text-center">
        <p className="text-section font-bold tracking-tight text-fg">Nothing needs escalating.</p>
        <p className="mt-1 text-prose text-fg-soft">
          Invoices appear here once they pass 90 days and four follow-ups.
        </p>
      </div>
    );
  }
  return <EligibleList data={eligibleQuery.data} />;
}

/** The loaded list, with selection. */
function EligibleList({ data }: { data: EligibleResponse }) {
  const navigate = Route.useNavigate();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const summary = eligibleSummary(data.items);
  const selectable = selectableIds(data.items);
  const selection = selectionSummary(data.items, selected);
  const routes = routeCount(data.seller);

  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));
  const someSelected = selectable.some((id) => selected.has(id));

  /** Adds or removes one row from the selection. */
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Opens the recovery ladder for the given invoices. */
  function openLadder(ids: Iterable<string>) {
    void navigate({ to: "/app/legal/recover", search: { invoices: serialiseInvoiceIds(ids) } });
  }

  const columns: Column<EligibleInvoice>[] = [
    {
      id: "select",
      header: "Select",
      headerHidden: true,
      headerCell: () => (
        <AppCheckbox
          aria-label="Select all eligible invoices"
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(selectable))}
        />
      ),
      cell: (row) =>
        row.lock === null ? (
          <AppCheckbox
            aria-label={`Select ${row.invoice_number}`}
            checked={selected.has(row.invoice_id)}
            onCheckedChange={() => toggle(row.invoice_id)}
          />
        ) : (
          <Info className="size-4 text-fg-muted" aria-label="Can't be selected" />
        ),
    },
    {
      id: "account",
      header: "Account",
      cell: (row) => (
        <span className="block">
          <span className="block">{row.account_name}</span>
          {row.lock ? (
            <span className="block text-prose font-normal text-fg-muted">{row.lock.reason}</span>
          ) : null}
        </span>
      ),
    },
    { id: "invoice", header: "Invoice", text: (row) => row.invoice_number },
    {
      id: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: (row) => <span className="tnum">{formatINR(row.amount_outstanding)}</span>,
    },
    {
      id: "days",
      header: "Days overdue",
      align: "right",
      cell: (row) => <span className="tnum text-danger">{formatDays(row.days_overdue)}</span>,
    },
    {
      id: "follow-ups",
      header: "Follow-ups",
      align: "right",
      text: (row) => String(row.follow_ups),
    },
    {
      id: "last",
      header: "Last contact",
      text: (row) => (row.last_contact_on ? formatShortDate(row.last_contact_on) : "Never"),
    },
    {
      id: "options",
      header: "Recovery options",
      cell: (row) => {
        if (row.lock?.matter_id) {
          return (
            <Link
              to="/app/legal/matters/$matterId"
              params={{ matterId: row.lock.matter_id }}
              className="text-body font-semibold text-fg-soft hover:text-fg"
            >
              View matter
            </Link>
          );
        }
        if (row.lock) return <span className="text-fg-muted">—</span>;
        return (
          <AppButton variant="text" onClick={() => openLadder([row.invoice_id])}>
            {routes} routes
          </AppButton>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <dl className="flex flex-wrap items-end gap-x-12 gap-y-3 border-b border-hairline pb-4">
        <div>
          <dd className="tnum text-title font-bold tracking-tight text-fg">
            {formatINR(summary.total)}
          </dd>
          <dt className="text-prose text-fg-soft">eligible</dt>
        </div>
        <Stat value={String(summary.accountCount)} label="accounts" />
        <Stat value={formatDays(summary.oldestDays)} label="oldest" />
        <Stat value={String(data.open_matter_count)} label="matters open" />
      </dl>

      <p className="max-w-3xl rounded-card bg-alt px-4 py-3 text-prose text-fg">
        These invoices are past 90 days and have had at least four follow-ups. Escalating is likely
        to end the commercial relationship — most clients do not continue working with a supplier
        after a legal notice.
      </p>

      {selection.count > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-hairline bg-alt px-4 py-2.5">
          <p className="tnum text-body font-semibold text-fg">
            {selection.count} selected · {formatINR(selection.total)}
          </p>
          <AppButton
            variant="secondary"
            onClick={() => openLadder(selection.rows.map((r) => r.invoice_id))}
          >
            See recovery options
          </AppButton>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-hairline bg-card">
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(row) => row.invoice_id}
          isRowSelected={(row) => selected.has(row.invoice_id)}
        />
      </div>
    </div>
  );
}

/** A secondary figure in the summary row. */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="tnum text-section font-bold text-fg">{value}</dd>
      <dt className="text-prose text-fg-soft">{label}</dt>
    </div>
  );
}
