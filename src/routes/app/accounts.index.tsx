import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

import { AccountStatusBadge } from "@/components/app/AccountStatusBadge";
import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { ContactPips } from "@/components/app/ContactPips";
import { DataTable, type Column } from "@/components/app/DataTable";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatDays, formatINR, isZeroMoney } from "@/lib/format";
import {
  accountsSearchSchema,
  type AccountListItem,
  type AccountsListFilter,
  type AccountsSearch,
  type AccountsSortColumn,
  type AccountsSortDir,
  type AccountsView,
} from "@/lib/schemas/accounts";
import { AccountsApiError, accountsQueryKeys, getAccounts } from "@/lib/services/accounts";

/**
 * Accounts list URL state.
 *
 * Example: `/app/accounts?filter=has_overdue&sort=outstanding&dir=desc`,
 * or `/app/accounts?view=archived` for the Archived tab.
 */
export const Route = createFileRoute("/app/accounts/")({
  validateSearch: accountsSearchSchema,
  head: () => ({ meta: [{ title: `Accounts — ${PRODUCT_NAME}` }] }),
  component: AccountsPage,
});

const FILTER_OPTIONS: { id: AccountsListFilter; label: string }[] = [
  { id: "has_overdue", label: "Has overdue" },
  { id: "missing_contacts", label: "Missing contacts" },
  { id: "paused", label: "Paused" },
];

function normalizeFilters(filter: AccountsSearch["filter"]): AccountsListFilter[] {
  if (filter === undefined) return [];
  return Array.isArray(filter) ? filter : [filter];
}

/** The accounts list, with the Active / Archived switch, filters and sortable columns. */
function AccountsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const archivedView = search.view === "archived";
  // Filters are about chasing, which archived accounts are out of.
  const filters = archivedView ? [] : normalizeFilters(search.filter);

  const listParams = {
    sort: search.sort,
    dir: search.dir,
    ...(archivedView ? { view: "archived" as const } : {}),
    ...(filters.length > 0 ? { filter: filters } : {}),
  };

  const listQuery = useQuery({
    queryKey: accountsQueryKeys.list(listParams),
    queryFn: () => getAccounts(listParams),
    retry: false,
  });

  function setSearch(patch: {
    view?: AccountsView;
    filter?: AccountsListFilter[];
    sort?: AccountsSortColumn;
    dir?: AccountsSortDir;
    clearFilter?: boolean;
  }) {
    void navigate({
      search: (prev: AccountsSearch): AccountsSearch => {
        const next: AccountsSearch = {
          view: patch.view ?? prev.view,
          sort: patch.sort ?? prev.sort,
          dir: patch.dir ?? prev.dir,
        };
        // Switching views starts from an unfiltered list.
        if (patch.view !== undefined && patch.view !== prev.view) return next;
        if (patch.clearFilter) return next;
        if (patch.filter !== undefined) {
          if (patch.filter.length === 0) return next;
          return {
            ...next,
            filter: patch.filter.length === 1 ? patch.filter[0] : patch.filter,
          };
        }
        if (prev.filter !== undefined) return { ...next, filter: prev.filter };
        return next;
      },
    });
  }

  function toggleFilter(id: AccountsListFilter) {
    const next = filters.includes(id) ? filters.filter((f) => f !== id) : [...filters, id];
    setSearch({ filter: next });
  }

  function clearFilters() {
    setSearch({ clearFilter: true });
  }

  function onSort(column: AccountsSortColumn) {
    if (search.sort === column) {
      setSearch({ dir: search.dir === "asc" ? "desc" : "asc" });
      return;
    }
    setSearch({ sort: column, dir: column === "name" ? "asc" : "desc" });
  }

  function ariaSortFor(column: AccountsSortColumn): "none" | "ascending" | "descending" {
    if (search.sort !== column) return "none";
    return search.dir === "asc" ? "ascending" : "descending";
  }

  const columns: Column<AccountListItem>[] = [
    {
      id: "name",
      header: "Account",
      ariaSort: ariaSortFor("name"),
      onHeaderClick: () => onSort("name"),
      cell: (row) => (
        <span className="flex max-w-xs items-center gap-2">
          {row.chase_status === "no_p0" ? (
            <AlertTriangle
              aria-label="No primary contact"
              className="size-3.5 shrink-0 text-danger"
              strokeWidth={2}
            />
          ) : null}
          <Link
            to="/app/accounts/$accountId"
            params={{ accountId: row.account_id }}
            title={row.name}
            className="truncate font-semibold text-fg underline-offset-2 hover:text-accent hover:underline"
          >
            {row.name}
          </Link>
        </span>
      ),
    },
    {
      id: "outstanding",
      header: "Outstanding",
      align: "right",
      ariaSort: ariaSortFor("outstanding"),
      onHeaderClick: () => onSort("outstanding"),
      text: (row) => formatINR(row.outstanding),
    },
    {
      id: "overdue",
      header: "Overdue",
      align: "right",
      ariaSort: ariaSortFor("overdue"),
      onHeaderClick: () => onSort("overdue"),
      cell: (row) => (
        <span className={isZeroMoney(row.overdue) ? "text-fg-muted" : "text-danger"}>
          {formatINR(row.overdue)}
        </span>
      ),
    },
    {
      id: "open_count",
      header: "Open invoices",
      align: "right",
      ariaSort: ariaSortFor("open_count"),
      onHeaderClick: () => onSort("open_count"),
      text: (row) => String(row.open_count),
    },
    {
      id: "oldest_overdue_days",
      header: "Oldest overdue",
      align: "right",
      ariaSort: ariaSortFor("oldest_overdue_days"),
      onHeaderClick: () => onSort("oldest_overdue_days"),
      text: (row) => (row.oldest_overdue_days === null ? "—" : formatDays(row.oldest_overdue_days)),
    },
    {
      id: "avg_days_late",
      header: "Avg days late",
      align: "right",
      ariaSort: ariaSortFor("avg_days_late"),
      onHeaderClick: () => onSort("avg_days_late"),
      text: (row) => (row.avg_days_late === null ? "—" : String(row.avg_days_late)),
    },
    {
      id: "contacts",
      header: "Contacts",
      ariaSort: ariaSortFor("contacts"),
      onHeaderClick: () => onSort("contacts"),
      cell: (row) => <ContactPips contacts={row.contacts} />,
    },
    {
      id: "chase_status",
      header: "Status",
      ariaSort: ariaSortFor("chase_status"),
      onHeaderClick: () => onSort("chase_status"),
      cell: (row) =>
        archivedView ? (
          <span className="inline-flex items-center rounded-pill bg-alt px-2.5 py-0.5 text-pill font-semibold text-fg-soft">
            Archived
          </span>
        ) : (
          <AccountStatusBadge label={row.status_label} />
        ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-bold tracking-tight text-fg">Accounts</h1>
          <MetricStrip query={listQuery} />
        </div>
        <AppButton
          variant="primary"
          onClick={() => {
            void navigate({ to: "/app/add-entries" });
          }}
        >
          Add entries
        </AppButton>
      </div>

      <div className="space-y-4">
        <ViewSwitch view={search.view} onChange={(view) => setSearch({ view })} />

        {archivedView ? (
          <ArchivedSummary
            count={listQuery.data?.filtered_count}
            outstanding={listQuery.data?.filtered_outstanding}
          />
        ) : (
          <FilterBar
            filters={filters}
            filteredCount={listQuery.data?.filtered_count}
            filteredOutstanding={listQuery.data?.filtered_outstanding}
            onToggle={toggleFilter}
            onClear={clearFilters}
            onSelectAll={clearFilters}
          />
        )}

        <AccountsBody
          query={listQuery}
          archivedView={archivedView}
          filters={filters}
          columns={columns}
          onClearFilters={clearFilters}
          onRetry={() => {
            void listQuery.refetch();
          }}
          onAddEntries={() => {
            void navigate({ to: "/app/add-entries" });
          }}
        />
      </div>
    </div>
  );
}

function MetricStrip({
  query,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getAccounts>>>>;
}) {
  if (query.isPending) {
    return (
      <div className="mt-2" aria-hidden="true">
        <AppSkeleton className="h-4 w-80" />
      </div>
    );
  }

  if (!query.data) return null;

  const { org_totals: totals } = query.data;
  return (
    <p className="mt-2 text-prose font-normal text-fg">
      {totals.account_count} accounts · {formatINR(totals.outstanding)} outstanding ·{" "}
      <span className="text-danger">{formatINR(totals.overdue)} overdue</span>
    </p>
  );
}

const VIEWS: { id: AccountsView; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "archived", label: "Archived" },
];

/**
 * Active / Archived switch. Each option changes the URL, so these are links in
 * a nav with `aria-current`, not ARIA tabs with panels.
 */
function ViewSwitch({
  view,
  onChange,
}: {
  view: AccountsView;
  onChange: (view: AccountsView) => void;
}) {
  return (
    <nav aria-label="Account views" className="flex gap-6 border-b border-hairline">
      {VIEWS.map((item) => {
        const current = item.id === view;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={current ? "page" : undefined}
            onClick={() => onChange(item.id)}
            className={
              current
                ? "border-b-2 border-accent-line pb-3 text-body font-semibold text-fg"
                : "border-b-2 border-transparent pb-3 text-body font-semibold text-fg-soft hover:text-fg"
            }
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/** The archived view's one-line summary, in place of the filter bar. */
function ArchivedSummary({
  count,
  outstanding,
}: {
  count: number | undefined;
  outstanding: string | undefined;
}) {
  if (count === undefined || outstanding === undefined) {
    return <AppSkeleton className="h-4 w-60" />;
  }
  return (
    <p className="text-prose font-normal text-fg-muted tnum">
      {count} archived {count === 1 ? "account" : "accounts"} · {formatINR(outstanding)} not counted
      in your totals
    </p>
  );
}

function FilterBar({
  filters,
  filteredCount,
  filteredOutstanding,
  onToggle,
  onClear,
  onSelectAll,
}: {
  filters: AccountsListFilter[];
  filteredCount: number | undefined;
  filteredOutstanding: string | undefined;
  onToggle: (id: AccountsListFilter) => void;
  onClear: () => void;
  onSelectAll: () => void;
}) {
  const allPressed = filters.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={allPressed}
            onClick={onSelectAll}
            className={pillClass(allPressed)}
          >
            All
          </button>
          {FILTER_OPTIONS.map((option) => {
            const pressed = filters.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onToggle(option.id)}
                className={pillClass(pressed)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {filteredCount !== undefined && filteredOutstanding !== undefined ? (
          <p className="text-prose font-normal text-fg-muted tnum">
            {filteredCount} accounts · {formatINR(filteredOutstanding)}
          </p>
        ) : (
          <AppSkeleton className="h-4 w-40" />
        )}
      </div>

      {filters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((id) => {
            const label = FILTER_OPTIONS.find((o) => o.id === id)?.label ?? id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className="inline-flex items-center gap-2 rounded-pill border border-stroke bg-card px-3 py-1 text-prose font-semibold text-fg hover:bg-hovered"
                aria-label={`Remove ${label} filter`}
              >
                {label}
                <span aria-hidden="true" className="text-fg-muted">
                  ×
                </span>
              </button>
            );
          })}
          <AppButton variant="text" onClick={onClear}>
            Clear all
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}

function pillClass(pressed: boolean): string {
  return [
    "rounded-pill px-3 py-1.5 text-prose font-semibold transition-colors duration-150",
    pressed
      ? "border border-accent-edge bg-accent-tint text-accent"
      : "border border-stroke bg-card text-fg hover:bg-hovered",
  ].join(" ");
}

/** The list body: loading, error, the right empty state for the view, or the table. */
function AccountsBody({
  query,
  archivedView,
  filters,
  columns,
  onClearFilters,
  onRetry,
  onAddEntries,
}: {
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof getAccounts>>>>;
  archivedView: boolean;
  filters: AccountsListFilter[];
  columns: Column<AccountListItem>[];
  onClearFilters: () => void;
  onRetry: () => void;
  onAddEntries: () => void;
}) {
  if (query.isPending) {
    return <AccountsLoading />;
  }

  if (query.isError) {
    const message =
      query.error instanceof AccountsApiError
        ? query.error.message
        : "Couldn't load your accounts.";
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <p className="text-body font-semibold text-fg">{message}</p>
        <AppButton variant="secondary" onClick={onRetry}>
          Retry
        </AppButton>
      </div>
    );
  }

  const data = query.data;
  if (!data) return null;

  // Empty — nothing archived.
  if (archivedView && data.total_count === 0) {
    return (
      <div className="flex max-w-md flex-col items-start gap-2 py-10">
        <h2 className="text-section font-bold text-fg">No archived accounts.</h2>
        <p className="text-body font-semibold text-fg-muted">
          Archive an account from its Settings tab to move it here. It stays out of your totals and
          nobody is chased, and you can restore it at any time.
        </p>
      </div>
    );
  }

  // Empty — first run (org has no accounts at all).
  if (data.total_count === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-4 py-10">
        <div>
          <h2 className="text-section font-bold text-fg">Nothing here yet.</h2>
          <p className="mt-2 text-body font-semibold text-fg-muted">
            Import an export from Tally, Zoho, or a spreadsheet — or type a few invoices in by hand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Import is not in this build. The one control here that leads
              somewhere is the manual path, so it is the only live one. */}
          <AppButton variant="primary" disabled title="File import is not in this build yet.">
            Upload a file
          </AppButton>
          <AppButton variant="secondary" onClick={onAddEntries}>
            Add entries manually
          </AppButton>
        </div>
      </div>
    );
  }

  // Empty — filtered.
  if (data.filtered_count === 0 && filters.length > 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-10">
        <p className="text-body font-semibold text-fg">No accounts match those filters.</p>
        <AppButton variant="text" onClick={onClearFilters}>
          Clear all filters
        </AppButton>
      </div>
    );
  }

  return <DataTable columns={columns} rows={data.items} rowKey={(row) => row.account_id} />;
}

function AccountsLoading() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading accounts">
      {Array.from({ length: 12 }, (_, i) => (
        <AppSkeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
