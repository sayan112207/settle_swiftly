import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatShortDate } from "@/lib/format";
import { accountsQueryKeys, getAccounts } from "@/lib/services/accounts";
import { getInvoices, invoicesQueryKeys } from "@/lib/services/invoices";
import { exportInvoicesAsCSV } from "@/lib/utils/csv-export";

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
  const due = new Date(dueDate);
  const today = new Date();
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/** Categorize days overdue into aging buckets for display. */
function getAgingBucket(daysOverdue: number): string {
  if (daysOverdue === 0) return "Not yet due";
  if (daysOverdue <= 30) return "1–30 days";
  if (daysOverdue <= 60) return "31–60 days";
  if (daysOverdue <= 90) return "61–90 days";
  return "90+ days";
}

/** Check if a date falls within a named range (Today, This week, etc.). */
function isDateInRange(dateStr: string, bucket: string): boolean {
  const date = new Date(`${dateStr}T12:00:00+05:30`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(today.getDate() - 7);

  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const quarterStart = new Date(today);
  const quarter = Math.floor(today.getMonth() / 3);
  quarterStart.setMonth(quarter * 3, 1);

  if (bucket === "Today") return date.toDateString() === today.toDateString();
  if (bucket === "This week") return date >= oneWeekAgo && date <= today;
  if (bucket === "This month")
    return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  if (bucket === "Last month") {
    const lastMonth = new Date(today);
    lastMonth.setMonth(today.getMonth() - 1);
    return (
      date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear()
    );
  }
  if (bucket === "This quarter") return date >= quarterStart && date <= today;
  return false;
}

/** Get Tailwind classes for status badge based on invoice status. */
function getStatusColor(status: string) {
  const s = status.toLowerCase();
  if (s === "paid" || s === "partially_paid") {
    return { bg: "bg-green-100", text: "text-green-700" };
  }
  if (s === "open") return { bg: "bg-gray-100", text: "text-gray-700" };
  if (s === "draft") return { bg: "bg-blue-100", text: "text-blue-700" };
  return { bg: "bg-gray-100", text: "text-gray-700" };
}

interface Invoice {
  id: string;
  invoice_number: string;
  account_id: string;
  amount: number;
  issue_date: string;
  due_date: string;
  status: string;
  [key: string]: unknown;
}

interface ActiveFilters {
  status?: string;
  ageing?: string;
  account?: string;
  amount?: string;
  invoiceDate?: string;
  dueDate?: string;
}

const SAVED_VIEWS = [
  { label: "Reconciliation", pinned: true },
  { label: "Exceptions", pinned: true },
  { label: "My overdue invoices", pinned: false },
  { label: "Outstanding > ₹1L", pinned: false },
];

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
    new Set(["account", "invoice", "amount", "invoiceDate", "dueDate", "status"]),
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
    const statuses = new Set(invoicesQuery.data.map((inv) => inv.status));
    return Array.from(statuses).sort();
  }, [invoicesQuery.data]);

  const uniqueAccounts = useMemo(() => {
    if (!invoicesQuery.data) return [];
    const accounts = new Set(
      invoicesQuery.data.map((inv) => accountNames.get(inv.account_id) ?? inv.account_id),
    );
    return Array.from(accounts).sort();
  }, [invoicesQuery.data, accountNames]);

  // Collections base dataset (unpaid AND overdue)
  const collectionsBase = useMemo(() => {
    if (!invoicesQuery.data) return [];
    return invoicesQuery.data.filter((inv) => {
      const isUnpaid = !["paid", "Paid", "written_off", "Written off"].includes(inv.status);
      const dueDate = new Date(`${inv.due_date}T12:00:00+05:30`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isOverdue = dueDate < today;
      return isUnpaid && isOverdue;
    });
  }, [invoicesQuery.data]);

  // Filter and sort logic
  const filteredInvoices = useMemo(() => {
    if (!invoicesQuery.data) return [];

    let result = viewMode === "collections" ? collectionsBase : invoicesQuery.data;

    // Apply saved view filter
    if (savedView === "Outstanding > ₹1L") {
      result = result.filter((inv) => inv.amount > 100000);
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
      result = result.filter((inv) => inv.status === activeFilters["status"]);
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
        result = result.filter((inv) => inv.amount >= bucket.min && inv.amount < bucket.max);
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
        const daysA = getDaysOverdue(a.due_date);
        const daysB = getDaysOverdue(b.due_date);
        return daysB - daysA;
      }
      if (sortBy === "Highest outstanding first") {
        return b.amount - a.amount;
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
    if (filteredInvoices.length === 0) return { outstanding: 0, overdue: 0, dueWeek: 0 };
    const outstanding = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const overdue = filteredInvoices
      .filter((inv) => getDaysOverdue(inv.due_date) > 0)
      .reduce((sum, inv) => sum + inv.amount, 0);
    const dueWeek = filteredInvoices
      .filter((inv) => {
        const days = getDaysOverdue(inv.due_date);
        return days >= 0 && days <= 7;
      })
      .reduce((sum, inv) => sum + inv.amount, 0);
    return { outstanding, overdue, dueWeek };
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
              ? `${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? "s" : ""} to chase · ${formatINR(String(metrics.overdue))}`
              : `${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? "s" : ""} · ${formatINR(String(metrics.outstanding))}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const toExport = filteredInvoices.map((inv) => ({
                id: inv.id,
                invoice_number: inv.invoice_number,
                account_id: inv.account_id,
                amount: inv.amount,
                issue_date: inv.issue_date,
                due_date: inv.due_date,
                status: inv.status,
              }));
              exportInvoicesAsCSV(
                toExport,
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

      {/* Metrics */}
      {!isLoading && !isError && invoicesQuery.data && (
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
        </div>
      )}

      {/* Tabs */}
      {!isLoading && !isError && invoicesQuery.data && invoicesQuery.data.length > 0 && (
        <>
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
                        {[
                          { key: "account", label: "Account" },
                          { key: "invoice", label: "Invoice" },
                          { key: "amount", label: "Amount" },
                          { key: "invoiceDate", label: "Invoice date" },
                          { key: "dueDate", label: "Due date" },
                          { key: "status", label: "Status" },
                        ].map((col) => (
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
            {filterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
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
                    setCurrentPage(1);
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
                  view.label === "Outstanding > ₹1L"
                    ? savedView === view.label
                      ? "border border-green-200 bg-green-50 text-green-700"
                      : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                    : "border border-gray-300 bg-white text-gray-400 cursor-not-allowed"
                }`}
                disabled={view.label !== "Outstanding > ₹1L"}
              >
                {view.label === "Outstanding > ₹1L" ? view.label : `${view.label} — Coming soon`}
              </button>
            ))}
            <button className="text-xs font-semibold text-green-700 hover:text-green-800 bg-none border-none cursor-pointer">
              Save this view
            </button>
          </div>

          {/* Active Filter Chips */}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
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
                  setCurrentPage(1);
                }}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Bulk Action Bar */}
          {selectedRows.size > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-green-700">
                  {selectedRows.size} selected on this page
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    alert("Record payment feature coming soon. Backend integration needed.");
                  }}
                  className="px-3 py-1 rounded-full bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50"
                >
                  Record payment
                </button>
                <button
                  onClick={() => {
                    alert("Bulk assign feature coming soon. Backend integration needed.");
                  }}
                  className="px-3 py-1 rounded-full bg-white border border-gray-300 text-gray-900 text-sm font-semibold hover:bg-gray-100"
                  title="Coming soon"
                >
                  Assign
                </button>
                <button
                  onClick={() => {
                    const selectedInvoices = paginatedInvoices.filter((inv) =>
                      selectedRows.has(inv.id),
                    );
                    const toExport = selectedInvoices.map((inv) => ({
                      id: inv.id,
                      invoice_number: inv.invoice_number,
                      account_id: inv.account_id,
                      amount: inv.amount,
                      issue_date: inv.issue_date,
                      due_date: inv.due_date,
                      status: inv.status,
                    }));
                    exportInvoicesAsCSV(
                      toExport,
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

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <AppSkeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-gray-900">Couldn't load invoices</p>
              <AppButton
                variant="secondary"
                onClick={async () => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (invoicesQuery as any).refetch();
                }}
                className="mt-4"
              >
                Retry
              </AppButton>
            </div>
          ) : isEmpty ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <p className="text-sm text-gray-600">No invoices yet. Add entries to begin.</p>
            </div>
          ) : isNoResults ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-gray-900">
                {viewMode === "collections"
                  ? "No overdue invoices to collect."
                  : "No invoices match these filters"}
              </p>
              {viewMode !== "collections" && (
                <button
                  onClick={() => {
                    setActiveFilters({});
                    setSearchInput("");
                    setCurrentPage(1);
                  }}
                  className="mt-4 rounded-full bg-green-700 text-white px-4 py-2 text-sm font-semibold hover:bg-green-800"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
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
                      {visibleColumns.has("account") && (
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          Account
                        </th>
                      )}
                      {visibleColumns.has("invoice") && (
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          Invoice
                        </th>
                      )}
                      {visibleColumns.has("amount") && (
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-600">
                          Amount
                        </th>
                      )}
                      {visibleColumns.has("invoiceDate") && (
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          Invoice date
                        </th>
                      )}
                      {visibleColumns.has("dueDate") && (
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          Due date
                        </th>
                      )}
                      {visibleColumns.has("status") && (
                        <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600">
                          Status
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInvoices.map((invoice) => {
                      const colors = getStatusColor(invoice.status);
                      const isSelected = selectedRows.has(invoice.id);
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
                          {visibleColumns.has("account") && (
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              {accountNames.get(invoice.account_id) ?? invoice.account_id}
                            </td>
                          )}
                          {visibleColumns.has("invoice") && (
                            <td className="px-4 py-3 text-sm text-green-700 font-semibold">
                              {invoice.invoice_number}
                            </td>
                          )}
                          {visibleColumns.has("amount") && (
                            <td className="px-4 py-3 text-right text-sm text-gray-900">
                              {formatINR(String(invoice.amount))}
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
                          {visibleColumns.has("status") && (
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  colors.bg
                                } ${colors.text}`}
                              >
                                {invoice.status}
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
                      .slice(Math.max(0, currentPage - 2), Math.min(totalPages, currentPage + 1))
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
                {formatINR(String(selectedInvoice.amount))}
              </div>
              <p className="text-sm text-gray-600 mt-1">Invoice amount</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h3 className="text-xs font-semibold uppercase text-gray-600 mb-3">Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span className="font-semibold text-gray-900">{selectedInvoice.status}</span>
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
                      {getDaysOverdue(selectedInvoice.due_date)} days
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 p-4 flex gap-2">
              <button className="flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Record payment
              </button>
              <button className="flex-1 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100">
                Set follow-up
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
