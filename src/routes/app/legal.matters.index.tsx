import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AppSkeleton } from "@/components/app/AppSkeleton";
import { DataTable, type Column } from "@/components/app/DataTable";
import { QueryNotice } from "@/components/app/QueryNotice";
import { TonePill } from "@/components/app/TonePill";
import { formatINR, formatShortDate } from "@/lib/format";
import type { MatterSummary } from "@/lib/schemas/legal";
import { getMatters, legalQueryKeys } from "@/lib/services/legal";
import { routeLabel, stageLabel, stageTone } from "@/lib/services/legal-rules";

export const Route = createFileRoute("/app/legal/matters/")({
  component: MattersPage,
});

const COLUMNS: Column<MatterSummary>[] = [
  {
    id: "account",
    header: "Account",
    cell: (row) => (
      <Link
        to="/app/legal/matters/$matterId"
        params={{ matterId: row.matter_id }}
        className="text-fg hover:text-accent"
      >
        {row.account_name}
      </Link>
    ),
  },
  {
    id: "amount",
    header: "Amount",
    align: "right",
    cell: (row) => <span className="tnum">{formatINR(row.amount)}</span>,
  },
  { id: "route", header: "Route", text: (row) => routeLabel(row.route) },
  { id: "advocate", header: "Advocate", text: (row) => row.advocate?.name ?? "—" },
  {
    id: "stage",
    header: "Stage",
    cell: (row) => <TonePill tone={stageTone(row.stage)}>{stageLabel(row.stage)}</TonePill>,
  },
  { id: "updated", header: "Last update", text: (row) => formatShortDate(row.last_update_on) },
  { id: "next", header: "Next step", text: (row) => row.next_step, wrap: true },
];

/** Every matter the business has opened, newest first. */
function MattersPage() {
  const mattersQuery = useQuery({
    queryKey: legalQueryKeys.matters,
    queryFn: () => getMatters(),
    retry: false,
  });

  if (mattersQuery.isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        <AppSkeleton className="h-11 w-full" />
        <AppSkeleton className="h-11 w-full" />
        <AppSkeleton className="h-11 w-full" />
      </div>
    );
  }
  if (mattersQuery.isError) {
    return (
      <QueryNotice
        error={mattersQuery.error}
        fallback="Couldn't load matters."
        onRetry={() => void mattersQuery.refetch()}
      />
    );
  }
  if (mattersQuery.data.length === 0) {
    return (
      <div className="rounded-card border border-hairline bg-card px-5 py-16 text-center">
        <p className="text-section font-bold tracking-tight text-fg">No matters yet.</p>
        <p className="mt-1 text-prose text-fg-soft">
          Matters appear here once you send an invoice to an advocate or record a statutory notice.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-card">
      <DataTable columns={COLUMNS} rows={mattersQuery.data} rowKey={(row) => row.matter_id} />
    </div>
  );
}
