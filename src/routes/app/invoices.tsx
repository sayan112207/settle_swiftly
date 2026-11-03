import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatOverdueDays, formatShortDate } from "@/lib/format";
import { accountsQueryKeys, getAccounts } from "@/lib/services/accounts";
import { DashboardApiError, dashboardQueryKeys, postChases } from "@/lib/services/dashboard";
import { getInvoices, invoicesQueryKeys, type InvoiceRow } from "@/lib/services/invoices";
import { exportInvoicesAsCSV } from "@/lib/utils/csv-export";
import {
  toISTDate,
  getTodayIST,
  getDaysUntilDue,
  isDateInRange,
  isDueThisWeek,
} from "@/lib/utils/invoice-date-utils";

const invoicesSearchSchema = z.object({
  status: z.enum(["overdue", "disputed", "promise-broken"]).optional(),
});

export const Route = createFileRoute("/app/invoices")({
  validateSearch: invoicesSearchSchema,
  head: () => ({ meta: [{ title: `Invoices — ${PRODUCT_NAME}` }] }),
  component: InvoicesPage,
});

/** Calculate days overdue from a due date. Returns 0 if not yet due. */
function getDaysOverdue(dueDate: string): number {
  const due = toISTDate(dueDate);
  const today = toISTDate(getTodayIST());
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/** Check if an invoice still has money owed: not a draft, not closed, and a balance left after payments. Status alone isn't enough, since nothing moves an invoice to "paid" when payments cover it. */
function isUnpaidInvoice(invoice: Invoice): boolean {
  if (["draft", "paid", "written_off", "void"].includes(invoice.status)) {
    return false;
  }
  return getOutstandingAmount(invoice) > 0;
}

/** Calculate outstanding amount for an invoice (gross - payments). */
function getOutstandingAmount(invoice: Invoice): number {
  // Rounded to paise so float subtraction can't leave a settled invoice owing a sliver.
  return Math.max(0, Math.round((invoice.amount - invoice.amount_paid) * 100) / 100);
}

/** Categorize days overdue into aging buckets for display. */
function getAgingBucket(daysOverdue: number): string {
  if (daysOverdue === 0) return "Not yet due";
  if (daysOverdue <= 30) return "1–30 days";
  if (daysOverdue <= 60) return "31–60 days";
  if (daysOverdue <= 90) return "61–90 days";
  return "90+ days";
}

/** The status a person reads: disputes and promises outrank the stored enum, and an open invoice reads as overdue or not yet due. */
function getDisplayStatus(invoice: Invoice): string {
  const isUnpaid = isUnpaidInvoice(invoice);
  if (invoice.disputed_at && isUnpaid) return "Disputed";
  if (invoice.promised_date && isUnpaid) return "Promised";
  if (invoice.status === "paid") return "Paid";
  if (invoice.status === "written_off") return "Written off";
  if (invoice.status === "void") return "Void";
  if (invoice.status === "draft") return "Draft";
  // Payments can cover an invoice without anything moving its status to "paid".
  if (!isUnpaid) return "Paid";
  if (invoice.status === "partially_paid") return "Partially paid";
  return getDaysOverdue(invoice.due_date) > 0 ? "Overdue" : "Not yet due";
}

/** Get Tailwind classes for status badge based on the display status. */
function getStatusColor(displayStatus: string) {
  if (
    displayStatus === "Overdue" ||
    displayStatus === "Disputed" ||
    displayStatus === "Written off"
  ) {
    return { bg: "bg-danger-tint", text: "text-danger" };
  }
  if (displayStatus === "Promised") return { bg: "bg-warn-tint", text: "text-warn" };
  if (displayStatus === "Paid") return { bg: "bg-accent-tint", text: "text-accent" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}

type Invoice = InvoiceRow;

interface ActiveFilters {
  status?: string;
  ageing?: string;
  account?: string;
  amount?: string;
  invoiceDate?: string;
  dueDate?: string;
}

// Views that aren't `available` need data the backend doesn't send yet.
const SAVED_VIEWS = [
  { label: "Reconciliation", pinned: true, available: false },
  { label: "Exceptions", pinned: true, available: false },
  { label: "My overdue invoices", pinned: false, available: false },
  { label: "Outstanding > ₹1L", pinned: false, available: true },
  { label: "TDS issues", pinned: false, available: false },
  { label: "GST mismatches", pinned: false, available: false },
  { label: "Promises due this week", pinned: false, available: true },
];

const DEEP_LINK_STATUS_LABELS = {
  overdue: "Overdue",
  disputed: "Disputed",
  "promise-broken": "Promise broken",
} as const;

const COLUMN_OPTIONS = [
  { key: "invoice", label: "Invoice #", align: "left" },
  { key: "account", label: "Account", align: "left" },
  { key: "invoiceDate", label: "Inv date", align: "left" },
  { key: "dueDate", label: "Due date", align: "left" },
  { key: "amount", label: "Invoice amt", align: "right" },
  { key: "paid", label: "Paid", align: "right" },
  { key: "outstanding", label: "Outstanding", align: "right" },
  { key: "ageing", label: "Ageing", align: "right" },
  { key: "status", label: "Status", align: "left" },
] as const;

const SORT_OPTIONS = [
  "Oldest overdue first",
  "Highest outstanding first",
  "Newest invoices first",
  "Largest invoices first",
  "Account A–Z",
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const AMOUNT_BUCKETS = [
  { label: "< ₹10k", key: "<10k", min: 0, max: 10000 },
  { label: "₹10k–50k", key: "10k-50k", min: 10000, max: 50000 },
  { label: "₹50k–₹1L", key: "50k-1L", min: 50000, max: 100000 },
  { label: "₹1L–₹5L", key: "1L-5L", min: 100000, max: 500000 },
  { label: "> ₹5L", key: ">5L", min: 500000, max: Infinity },
];

/** Invoices dashboard with filtering, sorting, and bulk actions. */
function InvoicesPage() {
  const { orgs } = Route.useRouteContext();
  const { status: statusFilter } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const orgId = orgs[0]!.id;

  // Query state
  const invoicesQuery = useQuery({
    queryKey: invoicesQueryKeys.list(orgId),
    queryFn: () => getInvoices({ data: { org_id: orgId } }),
    retry: false,
  });

  const accountsQuery = useQuery({
    queryKey: accountsQueryKeys.list({ sort: "name", dir: "asc" }),
    queryFn: () => getAccounts({ sort: "name", dir: "asc" }),
    retry: false,
  });

  const accountNames = useMemo(
    () =>
      new Map(
        (accountsQuery.data?.items ?? []).map((account) => [account.account_id, account.name]),
      ),
    [accountsQuery.data],
  );

  // UI state
  const [searchInput, setSearchInput] = useState("");
  const [viewMode, setViewMode] = useState<"all" | "collections">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [savedView, setSavedView] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("Oldest overdue first");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [openQuickFilter, setOpenQuickFilter] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(COLUMN_OPTIONS.map((col) => col.key)),
  );

  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
        setOpenQuickFilter(null);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setColumnsOpen(false);
        setOpenQuickFilter(null);
        setSelectedInvoice(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Get unique filter values
  const uniqueStatuses = useMemo(() => {
    if (!invoicesQuery.data) return [];
    const statuses = new Set(invoicesQuery.data.map(getDisplayStatus));
    return Array.from(statuses).sort();
  }, [invoicesQuery.data]);

  const uniqueAccounts = useMemo(() => {
    if (!invoicesQuery.data) return [];
    const accounts = new Set(
      invoicesQuery.data.map((inv) => accountNames.get(inv.account_id) ?? inv.account_id),
    );
    return Array.from(accounts).sort();
  }, [invoicesQuery.data, accountNames]);

  // Collections base dataset (unpaid AND overdue, excluding void)
  const collectionsBase = useMemo(() => {
    if (!invoicesQuery.data) return [];
    return invoicesQuery.data.filter((inv) => {
      const isUnpaid = isUnpaidInvoice(inv);
      const dueDate = toISTDate(inv.due_date);
      const today = toISTDate(getTodayIST());
      const isOverdue = dueDate < today;
      return isUnpaid && isOverdue;
    });
  }, [invoicesQuery.data]);

  // Filter and sort logic
  const filteredInvoices = useMemo(() => {
    if (!invoicesQuery.data) return [];

    let result = viewMode === "collections" ? collectionsBase : invoicesQuery.data;

    // Apply dashboard deep-link status filter
    if (statusFilter === "overdue") {
      result = result.filter((inv) => {
        const isUnpaid = isUnpaidInvoice(inv);
        const dueDate = toISTDate(inv.due_date);
        const today = toISTDate(getTodayIST());
        const isOverdue = dueDate < today;
        return isUnpaid && isOverdue;
      });
    } else if (statusFilter === "disputed") {
      result = result.filter((inv) => inv.disputed_at !== null);
    } else if (statusFilter === "promise-broken") {
      result = result.filter((inv) => inv.promise_broken_count >= 1);
    }

    // Apply saved view filter
    if (savedView === "Outstanding > ₹1L") {
      result = result.filter((inv) => getOutstandingAmount(inv) > 100000);
    } else if (savedView === "Promises due this week") {
      result = result.filter(
        (inv) =>
          isUnpaidInvoice(inv) && inv.promised_date !== null && isDueThisWeek(inv.promised_date),
      );
    }

    // Search filter
    if (searchInput.trim()) {
      const search = searchInput.toLowerCase();
      result = result.filter((inv) => {
        const accountName = accountNames.get(inv.account_id) ?? inv.account_id;
        return (
          inv.invoice_number.toLowerCase().includes(search) ||
          accountName.toLowerCase().includes(search)
        );
      });
    }

    // Apply active filters with AND logic
    if (activeFilters["status"]) {
      result = result.filter((inv) => getDisplayStatus(inv) === activeFilters["status"]);
    }
    if (activeFilters["ageing"]) {
      result = result.filter((inv) => {
        const bucket = getAgingBucket(getDaysOverdue(inv.due_date));
        return bucket === activeFilters["ageing"];
      });
    }
    if (activeFilters["account"]) {
      result = result.filter(
        (inv) => (accountNames.get(inv.account_id) ?? inv.account_id) === activeFilters["account"],
      );
    }
    if (activeFilters["amount"]) {
      const bucket = AMOUNT_BUCKETS.find((b) => b.key === activeFilters["amount"]);
      if (bucket) {
        result = result.filter(
          (inv) =>
            getOutstandingAmount(inv) >= bucket.min && getOutstandingAmount(inv) < bucket.max,
        );
      }
    }
    if (activeFilters["invoiceDate"]) {
      result = result.filter((inv) => isDateInRange(inv.issue_date, activeFilters["invoiceDate"]!));
    }
    if (activeFilters["dueDate"]) {
      result = result.filter((inv) => isDateInRange(inv.due_date, activeFilters["dueDate"]!));
    }

    // Sort
    const sortedResult = result.slice().sort((a, b) => {
      if (sortBy === "Oldest overdue first") {
        // Settled invoices count as 0 days so they sort after everything still owed.
        const daysA = isUnpaidInvoice(a) ? getDaysOverdue(a.due_date) : 0;
        const daysB = isUnpaidInvoice(b) ? getDaysOverdue(b.due_date) : 0;
        return daysB - daysA;
      }
      if (sortBy === "Highest outstanding first") {
        return getOutstandingAmount(b) - getOutstandingAmount(a);
      }
      if (sortBy === "Newest invoices first") {
        return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime();
      }
      if (sortBy === "Largest invoices first") {
        return b.amount - a.amount;
      }
      if (sortBy === "Account A–Z") {
        const nameA = accountNames.get(a.account_id) ?? a.account_id;
        const nameB = accountNames.get(b.account_id) ?? b.account_id;
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    return sortedResult;
  }, [
    invoicesQuery.data,
    viewMode,
    statusFilter,
    savedView,
    searchInput,
    activeFilters,
    sortBy,
    accountNames,
    collectionsBase,
  ]);

  // Pagination
  const totalPages = useMemo(
    () => Math.ceil(filteredInvoices.length / pageSize),
    [filteredInvoices.length, pageSize],
  );

  useEffect(() => {
    const maxPage = Math.max(1, totalPages);
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [totalPages, currentPage]);

  // Clear stale selections when dataset changes (filters/search/sort).
  // Prevents showing selection counts that don't match the current filtered results.
  useEffect(() => {
    setSelectedRows(new Set());
  }, [filteredInvoices]);

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredInvoices.slice(start, end);
  }, [filteredInvoices, currentPage, pageSize]);

  // Collections count (for badge)
  const collectionsCount = useMemo(() => {
    return collectionsBase.length;
  }, [collectionsBase]);

  // Metrics
  const metrics = useMemo(() => {
    if (filteredInvoices.length === 0) {
      return { outstanding: 0, overdue: 0, dueWeek: 0, promised: 0 };
    }
    const unpaid = filteredInvoices.filter(isUnpaidInvoice);
    const outstanding = unpaid.reduce((sum, inv) => sum + getOutstandingAmount(inv), 0);
    const overdue = unpaid
      .filter((inv) => getDaysOverdue(inv.due_date) > 0)
      .reduce((sum, inv) => sum + getOutstandingAmount(inv), 0);
    const dueWeek = unpaid
      .filter((inv) => isDueThisWeek(inv.due_date))
      .reduce((sum, inv) => sum + getOutstandingAmount(inv), 0);
    const promised = unpaid
      .filter((inv) => inv.promised_date !== null)
      .reduce((sum, inv) => sum + getOutstandingAmount(inv), 0);
    return { outstanding, overdue, dueWeek, promised };
  }, [filteredInvoices]);

  const isLoading = invoicesQuery.isPending;
  const isError = !!invoicesQuery.error;
  const isEmpty = !isLoading && (invoicesQuery.data?.length ?? 0) === 0;
  const isNoResults =
    !isLoading && filteredInvoices.length === 0 && (invoicesQuery.data?.length ?? 0) > 0;

  // Page selection
  const pageAllChecked =
    paginatedInvoices.length > 0 && paginatedInvoices.every((inv) => selectedRows.has(inv.id));

  const togglePageSelection = () => {
    const newSelected = new Set(selectedRows);
    paginatedInvoices.forEach((inv) => {
      if (pageAllChecked) {
        newSelected.delete(inv.id);
      } else {
        newSelected.add(inv.id);
      }
    });
    setSelectedRows(newSelected);
  };

  const toggleRowSelection = (invoiceId: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedRows(newSelected);
  };

  const filterChips = Object.entries(activeFilters)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      let displayLabel = value as string;
      if (key === "amount") {
        const bucket = AMOUNT_BUCKETS.find((b) => b.key === value);
        displayLabel = bucket?.label ?? value;
      }
      return {
        label: displayLabel,
        key,
      };
    });

  /** Drop the dashboard deep-link filter (?status=) without touching the rest of the page. */
  const clearStatusSearch = () => {
    void navigate({ search: {} });
    setCurrentPage(1);
  };

  /** Reset every filter source: chips, search, saved view and the ?status= deep link. */
  const clearAllFilters = () => {
    setActiveFilters({});
    setSearchInput("");
    setSavedView(null);
    clearStatusSearch();
  };

  const toExportRows = (invoices: Invoice[]) =>
    invoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      account_name: accountNames.get(inv.account_id) ?? inv.account_id,
      amount: inv.amount,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      status: getDisplayStatus(inv),
    }));

  const chaseMutation = useMutation({
    mutationFn: (invoiceIds: readonly string[]) => postChases(invoiceIds),
    onSuccess: async (result) => {
      setSelectedRows(new Set());
      await queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.chaseQueue });
      if (result.skipped.length === 0) {
        const word = result.queued === 1 ? "invoice" : "invoices";
        toast(`${result.queued} ${word} queued`);
        return;
      }
      const skipped = result.skipped
        .map((entry) => {
          const invoice = invoicesQuery.data?.find((inv) => inv.id === entry.invoice_id);
          return `${invoice?.invoice_number ?? entry.invoice_id} (${entry.reason})`;
        })
        .join(", ");
      toast(`${result.queued} queued. Skipped ${skipped}.`);
    },
    onError: (error, invoiceIds) => {
      const fallback =
        invoiceIds.length === 1 ? "Couldn't queue that chase." : "Couldn't queue those chases.";
      toast(error instanceof DashboardApiError ? error.message : fallback);
    },
  });

  const handleQuickFilterSelect = (filterName: string, value: string) => {
    const newFilters = { ...activeFilters };
    const filterKey =
      filterName.toLowerCase() === "ageing"
        ? "ageing"
        : filterName.toLowerCase() === "invoice date"
          ? "invoiceDate"
          : filterName.toLowerCase() === "due date"
            ? "dueDate"
            : filterName.toLowerCase();

    if (filterKey === "ageing" || filterKey === "invoiceDate" || filterKey === "dueDate") {
      newFilters[filterKey as keyof ActiveFilters] = value;
    } else {
      newFilters[filterKey as keyof ActiveFilters] = value;
    }
    setActiveFilters(newFilters);
    setOpenQuickFilter(null);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <header className="flex items-start justify-between gap-6 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="mt-1 text-sm text-gray-600">
            {viewMode === "collections"
              ? `${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? "s" : ""} to chase · ${formatINR(String(metrics.overdue))} overdue`
              : `${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? "s" : ""} · ${formatINR(String(metrics.outstanding))} outstanding`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              exportInvoicesAsCSV(
                toExportRows(filteredInvoices),
                `invoices-${new Date().toISOString().split("T")[0]}.csv`,
              );
            }}
            className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
          >
            Export
          </button>
          <Link
            to="/app/add-entries"
            className="flex items-center gap-1 rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
          >
            + Add entries
          </Link>
        </div>
      </header>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <AppSkeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-gray-900">We couldn't load your invoices</p>
          <p className="mt-1 text-sm text-gray-600">
            Your filters are still applied — nothing has changed.
          </p>
          <AppButton
            variant="secondary"
            onClick={async () => {
              await invoicesQuery.refetch();
            }}
            className="mt-4"
          >
            Try again
          </AppButton>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && isEmpty && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <h2 className="text-lg font-bold text-gray-900">No invoices yet</h2>
          <p className="mt-1 text-sm text-gray-600">
            Type a few in, or import an export from Tally or Zoho.
          </p>
          <Link
            to="/app/add-entries"
            className="mt-4 inline-flex items-center rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
          >
            Add entries
          </Link>
        </div>
      )}

      {/* Populated state */}
      {!isLoading && !isError && !isEmpty && (
        <>
          {/* Metrics */}
          <div className="flex gap-8 border-b border-gray-200 pb-4 items-baseline">
            <div className="text-left">
              <div className="text-2xl font-bold text-gray-900">
                {formatINR(String(metrics.outstanding))}
              </div>
              <div className="text-sm text-gray-600 mt-1">Outstanding</div>
            </div>
            <div className="text-left">
              <div className="text-lg font-bold text-red-700">
                {formatINR(String(metrics.overdue))}
              </div>
              <div className="text-sm text-gray-600 mt-1">Overdue</div>
            </div>
            <div className="text-left">
              <div className="text-lg font-bold text-amber-700">
                {formatINR(String(metrics.dueWeek))}
              </div>
              <div className="text-sm text-gray-600 mt-1">Due this week</div>
            </div>
            <div className="text-left">
              <div className="text-lg font-bold text-amber-700">
                {formatINR(String(metrics.promised))}
              </div>
              <div className="text-sm text-gray-600 mt-1">Promised</div>
            </div>
            <div className="text-left" title="Coming soon" aria-label="Blocked (coming soon)">
              <div className="text-lg font-bold text-gray-400">—</div>
              <div className="text-sm text-gray-400 mt-1">Blocked</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-gray-200 pb-2">
            <button
              onClick={() => {
                setViewMode("all");
                setCurrentPage(1);
                setSelectedRows(new Set());
              }}
              className={`text-sm font-semibold border-b-2 pb-2 transition-colors ${
                viewMode === "all"
                  ? "text-gray-900 border-green-700"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              All invoices
            </button>
            <button
              onClick={() => {
                setViewMode("collections");
                setCurrentPage(1);
                setSelectedRows(new Set());
              }}
              className={`flex items-center gap-2 text-sm font-semibold border-b-2 pb-2 transition-colors ${
                viewMode === "collections"
                  ? "text-gray-900 border-green-700"
                  : "text-gray-600 border-transparent hover:text-gray-900"
              }`}
            >
              Collections
              {collectionsCount > 0 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  {collectionsCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Bar - Responsive Layout */}
          <div ref={filterMenuRef}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Search */}
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 h-10 flex-grow min-w-64 focus-within:border-gray-400 focus-within:[--tw-ring-color:transparent]">
                <Search width="14" height="14" className="text-gray-600" />
                <input
                  type="search"
                  placeholder="Search invoice, account..."
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="flex-1 border-none bg-transparent text-sm outline-none"
                  style={
                    {
                      outline: "none",
                      boxShadow: "none",
                      WebkitFocusRingColor: "transparent",
                    } as Record<string, string>
                  }
                />
              </div>

              {/* Quick Filters */}
              {["Status", "Ageing", "Account", "Amount", "Invoice date", "Due date"].map(
                (filter) => (
                  <div key={filter} className="relative">
                    <button
                      onClick={() => {
                        setOpenQuickFilter(openQuickFilter === filter ? null : filter);
                        setColumnsOpen(false);
                      }}
                      className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold h-10 whitespace-nowrap ${
                        openQuickFilter === filter
                          ? "border border-green-200 bg-green-50 text-green-700"
                          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {filter}
                      <ChevronDown
                        width="12"
                        height="12"
                        className={`transition-transform ${openQuickFilter === filter ? "rotate-180" : ""}`}
                      />
                    </button>
                    {openQuickFilter === filter && (
                      <div className="absolute top-10 left-0 z-20 min-w-max rounded-lg border border-gray-200 bg-white shadow-lg">
                        {filter === "Status" &&
                          uniqueStatuses.map((status) => (
                            <button
                              key={status}
                              onClick={() => handleQuickFilterSelect(filter, status)}
                              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                            >
                              {status}
                            </button>
                          ))}
                        {filter === "Ageing" &&
                          ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days"].map(
                            (bucket) => (
                              <button
                                key={bucket}
                                onClick={() => handleQuickFilterSelect(filter, bucket)}
                                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                {bucket}
                              </button>
                            ),
                          )}
                        {filter === "Account" &&
                          uniqueAccounts.map((account) => (
                            <button
                              key={account}
                              onClick={() => handleQuickFilterSelect(filter, account)}
                              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100 whitespace-nowrap"
                            >
                              {account}
                            </button>
                          ))}
                        {filter === "Amount" &&
                          AMOUNT_BUCKETS.map((bucket) => (
                            <button
                              key={bucket.key}
                              onClick={() => handleQuickFilterSelect(filter, bucket.key)}
                              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                            >
                              {bucket.label}
                            </button>
                          ))}
                        {filter === "Invoice date" &&
                          ["Today", "This week", "This month", "Last month", "This quarter"].map(
                            (bucket) => (
                              <button
                                key={bucket}
                                onClick={() => handleQuickFilterSelect(filter, bucket)}
                                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                {bucket}
                              </button>
                            ),
                          )}
                        {filter === "Due date" &&
                          ["Today", "This week", "This month", "Last month", "This quarter"].map(
                            (bucket) => (
                              <button
                                key={bucket}
                                onClick={() => handleQuickFilterSelect(filter, bucket)}
                                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
                              >
                                {bucket}
                              </button>
                            ),
                          )}
                      </div>
                    )}
                  </div>
                ),
              )}

              <button
                type="button"
                disabled
                title="Coming soon"
                aria-label="More filters (coming soon)"
                className="flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm font-semibold h-10 whitespace-nowrap text-gray-400 cursor-not-allowed"
              >
                More filters
              </button>

              {/* Sort & Columns - grouped on right */}
              <div className="flex items-center gap-2 ml-auto">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value);
                    setCurrentPage(1);
                  }}
                  onFocus={() => setColumnsOpen(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 h-10 focus:border-gray-400 focus:[--tw-ring-color:transparent] focus:[box-shadow:none]"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <button
                    onClick={() => {
                      setColumnsOpen(!columnsOpen);
                      setOpenQuickFilter(null);
                    }}
                    className="rounded-full border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 h-10 whitespace-nowrap focus:border-gray-400 focus:ring-0"
                  >
                    Columns
                  </button>
                  {columnsOpen && (
                    <div className="absolute top-10 right-0 z-20 w-56 rounded-lg border border-gray-200 bg-white shadow-lg p-4">
                      <div className="text-xs font-semibold uppercase text-gray-600 mb-3">
                        Visible columns
                      </div>
                      <div className="space-y-2">
                        {COLUMN_OPTIONS.map((col) => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={visibleColumns.has(col.key)}
                              onChange={(e) => {
                                const newCols = new Set(visibleColumns);
                                if (e.target.checked) {
                                  newCols.add(col.key);
                                } else {
                                  newCols.delete(col.key);
                                }
                                setVisibleColumns(newCols);
                              }}
                              className="w-4 h-4 rounded border-gray-300"
                            />
                            {col.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Active Filter Chips */}
            {(filterChips.length > 0 || statusFilter) && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {statusFilter && (
                  <div className="flex items-center gap-2 rounded-full bg-gray-100 border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-900">
                    {DEEP_LINK_STATUS_LABELS[statusFilter]}
                    <button
                      onClick={clearStatusSearch}
                      aria-label={`Remove ${DEEP_LINK_STATUS_LABELS[statusFilter]} filter`}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      ×
                    </button>
                  </div>
                )}
                {filterChips.map((chip) => (
                  <div
                    key={chip.key}
                    className="flex items-center gap-2 rounded-full bg-gray-100 border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-900"
                  >
                    {chip.label}
                    <button
                      onClick={() => {
                        const newFilters = { ...activeFilters };
                        delete newFilters[chip.key as keyof ActiveFilters];
                        setActiveFilters(newFilters);
                        setCurrentPage(1);
                      }}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    setActiveFilters({});
                    clearStatusSearch();
                  }}
                  className="text-xs font-semibold text-gray-600 hover:text-gray-900"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {/* Saved Views */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs font-semibold uppercase text-gray-600">Saved</span>
            {SAVED_VIEWS.map((view) => (
              <button
                key={view.label}
                onClick={() => {
                  setSavedView(savedView === view.label ? null : view.label);
                  setCurrentPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  view.available
                    ? savedView === view.label
                      ? "border border-green-200 bg-green-50 text-green-700"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                    : "border border-gray-300 bg-white text-gray-400 cursor-not-allowed"
                }`}
                disabled={!view.available}
                title={view.available ? undefined : "Coming soon"}
                aria-label={view.available ? undefined : `${view.label} (coming soon)`}
              >
                {view.label}
              </button>
            ))}
            <button
              type="button"
              disabled
              title="Coming soon"
              aria-label="Save this view (coming soon)"
              className="text-xs font-semibold text-gray-400 bg-none border-none cursor-not-allowed"
            >
              Save this view
            </button>
          </div>

          {/* Bulk Action Bar */}
          {selectedRows.size > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-green-700">
                  {selectedRows.size} selected
                </div>
              </div>
              <div className="flex gap-2">
                {viewMode === "collections" && (
                  <button
                    onClick={() => chaseMutation.mutate(Array.from(selectedRows))}
                    disabled={chaseMutation.isPending}
                    aria-busy={chaseMutation.isPending}
                    className="px-3 py-1 rounded-full bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
                  >
                    Chase
                  </button>
                )}
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  aria-label="Record payment (coming soon)"
                  className="px-3 py-1 rounded-full bg-white border border-gray-300 text-gray-400 text-sm font-semibold cursor-not-allowed"
                >
                  Record payment
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  aria-label="Assign (coming soon)"
                  className="px-3 py-1 rounded-full bg-white border border-gray-300 text-gray-400 text-sm font-semibold cursor-not-allowed"
                >
                  Assign
                </button>
                <button
                  onClick={() => {
                    exportInvoicesAsCSV(
                      toExportRows(filteredInvoices.filter((inv) => selectedRows.has(inv.id))),
                      `invoices-selected-${new Date().toISOString().split("T")[0]}.csv`,
                    );
                  }}
                  className="px-3 py-1 rounded-full bg-white border border-gray-300 text-gray-900 text-sm font-semibold hover:bg-gray-100"
                >
                  Export
                </button>
              </div>
            </div>
          )}

          {/* No results state (when filters return empty) */}
          {isNoResults ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-gray-900">
                {viewMode === "collections"
                  ? "No overdue invoices to collect."
                  : "No invoices match these filters"}
              </p>
              {viewMode !== "collections" && (
                <button
                  onClick={clearAllFilters}
                  className="mt-4 rounded-full bg-green-700 text-white px-4 py-2 text-sm font-semibold hover:bg-green-800"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 w-12">
                        <input
                          type="checkbox"
                          checked={pageAllChecked}
                          onChange={togglePageSelection}
                          className="w-4 h-4"
                        />
                      </th>
                      {COLUMN_OPTIONS.filter((col) => visibleColumns.has(col.key)).map((col) => (
                        <th
                          key={col.key}
                          className={`px-4 py-3 text-xs font-semibold uppercase text-gray-600 ${
                            col.align === "right" ? "text-right" : "text-left"
                          }`}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInvoices.map((invoice) => {
                      const displayStatus = getDisplayStatus(invoice);
                      const colors = getStatusColor(displayStatus);
                      const isSelected = selectedRows.has(invoice.id);
                      const isUnpaid = isUnpaidInvoice(invoice);
                      return (
                        <tr
                          key={invoice.id}
                          onClick={() => setSelectedInvoice(invoice)}
                          className={`border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                            isSelected ? "bg-green-50" : ""
                          }`}
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowSelection(invoice.id);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4"
                            />
                          </td>
                          {visibleColumns.has("invoice") && (
                            <td className="px-4 py-3 text-sm text-green-700 font-semibold">
                              {invoice.invoice_number}
                            </td>
                          )}
                          {visibleColumns.has("account") && (
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              {accountNames.get(invoice.account_id) ?? invoice.account_id}
                            </td>
                          )}
                          {visibleColumns.has("invoiceDate") && (
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {formatShortDate(invoice.issue_date)}
                            </td>
                          )}
                          {visibleColumns.has("dueDate") && (
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {formatShortDate(invoice.due_date)}
                            </td>
                          )}
                          {visibleColumns.has("amount") && (
                            <td className="px-4 py-3 text-right text-sm text-gray-900">
                              {formatINR(String(invoice.amount))}
                            </td>
                          )}
                          {visibleColumns.has("paid") && (
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {formatINR(String(invoice.amount_paid))}
                            </td>
                          )}
                          {visibleColumns.has("outstanding") && (
                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                              {formatINR(String(getOutstandingAmount(invoice)))}
                            </td>
                          )}
                          {visibleColumns.has("ageing") && (
                            <td className="px-4 py-3 text-right text-sm text-gray-600">
                              {isUnpaid ? getAgingBucket(getDaysOverdue(invoice.due_date)) : "—"}
                            </td>
                          )}
                          {visibleColumns.has("status") && (
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  colors.bg
                                } ${colors.text}`}
                              >
                                {displayStatus}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between gap-4 mt-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>
                    Showing {filteredInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                    {Math.min(currentPage * pageSize, filteredInvoices.length)} of{" "}
                    {filteredInvoices.length}
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} rows
                      </option>
                    ))}
                  </select>
                </div>

                {totalPages > 1 && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .slice(Math.max(0, currentPage - 2), Math.max(3, currentPage + 1))
                      .map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`rounded-lg border px-2 py-1 text-sm font-semibold ${
                            currentPage === page
                              ? "border-green-700 bg-green-700 text-white"
                              : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    {Math.max(3, currentPage + 1) < totalPages && (
                      <>
                        <span className="px-2 py-1 text-gray-400">…</span>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 hover:bg-gray-100"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm disabled:opacity-50"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Detail Drawer */}
      {selectedInvoice && (
        <>
          <div
            className="fixed inset-0 bg-black/35 z-40"
            onClick={() => setSelectedInvoice(null)}
          />
          <div className="fixed top-0 right-0 bottom-0 w-96 bg-white border-l border-gray-200 z-50 overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {selectedInvoice.invoice_number}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {accountNames.get(selectedInvoice.account_id) ?? selectedInvoice.account_id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="text-gray-600 hover:text-gray-900"
                >
                  <X width="20" height="20" />
                </button>
              </div>
              <div className="mt-6 text-3xl font-bold text-gray-900">
                {formatINR(String(getOutstandingAmount(selectedInvoice)))}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                outstanding of {formatINR(String(selectedInvoice.amount))}
              </p>
              <Link
                to="/app/accounts/$accountId"
                params={{ accountId: selectedInvoice.account_id }}
                className="mt-3 inline-block text-sm font-semibold text-green-700 hover:text-green-800"
              >
                View account
              </Link>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-600 mb-3">Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        getStatusColor(getDisplayStatus(selectedInvoice)).bg
                      } ${getStatusColor(getDisplayStatus(selectedInvoice)).text}`}
                    >
                      {getDisplayStatus(selectedInvoice)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Paid</span>
                    <span className="font-semibold text-gray-900">
                      {formatINR(String(selectedInvoice.amount_paid))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Outstanding</span>
                    <span className="font-semibold text-gray-900">
                      {formatINR(String(getOutstandingAmount(selectedInvoice)))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Invoice date</span>
                    <span className="font-semibold text-gray-900">
                      {formatShortDate(selectedInvoice.issue_date)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Due date</span>
                    <span className="font-semibold text-gray-900">
                      {formatShortDate(selectedInvoice.due_date)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Days overdue</span>
                    <span className="font-semibold text-gray-900">
                      {isUnpaidInvoice(selectedInvoice)
                        ? formatOverdueDays(getDaysOverdue(selectedInvoice.due_date))
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-4 flex gap-2">
              <button
                type="button"
                disabled
                title="Coming soon"
                aria-label="Record payment (coming soon)"
                className="flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed"
              >
                Record payment
              </button>
              <button
                type="button"
                disabled
                title="Coming soon"
                aria-label="Set follow-up (coming soon)"
                className="flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed"
              >
                Set follow-up
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
