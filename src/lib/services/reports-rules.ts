import type { ChaseResponse } from "@/lib/schemas/dashboard";
import type { AgedDebtItem, DsoPoint, ReadyWeeklyReport } from "@/lib/schemas/reports";

/**
 * Pure rules behind the Reports screen. No React, no fetch — everything here is
 * unit-tested in `reports-rules.test.ts`.
 */

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The month index from a `YYYY-MM` string.
 *
 * Read from the string rather than through `Date`: `new Date("2026-03")` is
 * midnight UTC, which is still February in any time zone west of Greenwich.
 */
function monthIndex(yearMonth: string): number {
  return Number(yearMonth.slice(5, 7)) - 1;
}

/** "2026-03" → "Mar", for the chart's axis labels. */
export function formatMonthShort(yearMonth: string): string {
  return MONTH_SHORT[monthIndex(yearMonth)] ?? yearMonth;
}

/** "2026-03" → "March", for prose such as the DSO delta line. */
export function formatMonthLong(yearMonth: string): string {
  return MONTH_LONG[monthIndex(yearMonth)] ?? yearMonth;
}

/** Money string → integer paise. Strings in, so no float ever touches paise. */
function toPaise(value: string): bigint {
  const negative = value.startsWith("-");
  const [rupees = "0", paise = "0"] = (negative ? value.slice(1) : value).split(".");
  const total = BigInt(rupees) * 100n + BigInt(paise.padEnd(2, "0").slice(0, 2));
  return negative ? -total : total;
}

/** Integer paise → money string in the contract's own format ("300000.00"). */
function fromPaise(paise: bigint): string {
  const sign = paise < 0n ? "-" : "";
  const abs = paise < 0n ? -paise : paise;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * The aged-debt footer: total owed and how many distinct accounts owe it.
 *
 * Rows are invoices, not accounts, so one account with two old invoices counts
 * once — "across 5 accounts" must not become "across 6".
 */
export function agedDebtSummary(rows: readonly AgedDebtItem[]): {
  total: string;
  accountCount: number;
} {
  const total = rows.reduce((sum, row) => sum + toPaise(row.amount_outstanding), 0n);
  const accounts = new Set(rows.map((row) => row.account_id));
  return { total: fromPaise(total), accountCount: accounts.size };
}

/**
 * How this week's collections compare with last week's, as the words that
 * lead into the tile's sub-line ("up from ₹3,10,000.00 last week").
 *
 * Compared in paise, not through `Number`, so two amounts that differ only in
 * paise never read as "same as".
 */
export function collectedDirection(thisWeek: string, lastWeek: string): string {
  const now = toPaise(thisWeek);
  const before = toPaise(lastWeek);
  if (now > before) return "up from";
  if (now < before) return "down from";
  return "same as";
}

/**
 * The toast after a single-row Chase.
 *
 * The server re-checks every invoice, so a row that was chaseable on load can
 * come back skipped (paid or disputed in the meantime). A reply that neither
 * queued nor skipped anything is reported as such rather than as success.
 */
export function chaseOutcomeMessage(result: ChaseResponse, invoiceNumber: string): string {
  const skipped = result.skipped[0];
  if (skipped !== undefined) return `Skipped ${invoiceNumber} (${skipped.reason}).`;
  if (result.queued === 0) return `${invoiceNumber} wasn't queued. Try again in a moment.`;
  return `${invoiceNumber} queued`;
}

/**
 * The months the DSO chart draws: the most recent year at most. A longer
 * history would squeeze the bars and their labels into each other; the full
 * series still goes into the CSV.
 */
export const DSO_CHART_MAX_MONTHS = 12;

/** The tail of the series the chart shows. */
export function dsoChartWindow(series: readonly DsoPoint[]): readonly DsoPoint[] {
  return series.slice(-DSO_CHART_MAX_MONTHS);
}

export type DsoTrend = {
  /** Sentence under the current DSO, e.g. "↓ 9 days since March". */
  label: string;
  /** Falling DSO is good news; rising is bad; flat or single-point is neither. */
  tone: "good" | "bad" | "neutral";
};

/**
 * How DSO moved across the series, first point to last.
 *
 * Lower DSO means customers pay sooner, so a fall is the good direction. That
 * is the opposite of most "up is green" charts and is why tone is computed
 * here rather than inferred from the arrow.
 */
export function dsoTrend(series: readonly DsoPoint[]): DsoTrend {
  const first = series[0];
  const last = series[series.length - 1];
  if (first === undefined || last === undefined || series.length < 2) {
    return { label: "Not enough history yet", tone: "neutral" };
  }

  const since = formatMonthLong(first.month);
  const change = last.days - first.days;
  if (change === 0) return { label: `No change since ${since}`, tone: "neutral" };

  const magnitude = Math.abs(change);
  const unit = magnitude === 1 ? "day" : "days";
  return change < 0
    ? { label: `↓ ${magnitude} ${unit} since ${since}`, tone: "good" }
    : { label: `↑ ${magnitude} ${unit} since ${since}`, tone: "bad" };
}

/** Shortest bar in px, so the lowest month still reads as a bar, not a line. */
const DSO_BAR_MIN_PX = 24;
/** Extra height the tallest bar gets over the shortest. */
const DSO_BAR_RANGE_PX = 60;

/**
 * Bar heights for the DSO chart, scaled between the series' own min and max.
 *
 * Scaled to the range rather than from zero because the interesting signal is
 * a few days' movement on a ~40-day base; from zero, six bars would look equal.
 */
export function dsoBarHeights(series: readonly DsoPoint[]): number[] {
  const values = series.map((point) => point.days);
  // Math.min() of nothing is Infinity, which would paint NaN-pixel bars.
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map(
    (value) => Math.round(((value - min) / span) * DSO_BAR_RANGE_PX) + DSO_BAR_MIN_PX,
  );
}

/**
 * One CSV field, quoted when it has to be.
 *
 * Text that a spreadsheet would run as a formula (leading `=`, `+`, `-`, `@`)
 * is prefixed with an apostrophe — account names and reasons are customer
 * data. Plain numbers, negative ones included, are left alone so they stay
 * numbers when the file is opened.
 */
export function csvField(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV line from its fields. */
function csvRow(fields: readonly (string | number)[]): string {
  return fields.map(csvField).join(",");
}

/**
 * The whole report as one CSV, one block per section in screen order.
 *
 * Amounts are written as the contract's plain decimals ("95000.00"), not as
 * formatted rupees: a spreadsheet can sum the former and only displays the
 * latter. CRLF line endings because that is what RFC 4180 and Excel expect.
 */
export function reportToCsv(report: ReadyWeeklyReport): string {
  const { tiles } = report;
  const lines: string[] = [
    csvRow(["Weekly report", report.as_of]),
    "",
    csvRow(["Metric", "Value"]),
    csvRow(["Collected this week (INR)", tiles.collected_this_week]),
    csvRow(["Collected last week (INR)", tiles.collected_last_week]),
    csvRow(["DSO (days)", tiles.dso_days]),
    csvRow(["DSO at signup (days)", tiles.dso_at_signup_days]),
    csvRow(["Messages sent", tiles.messages_sent]),
    csvRow(["Messages approved manually", tiles.messages_approved_manually]),
    csvRow(["Hours saved (estimated)", tiles.hours_saved_estimate]),
    "",
    csvRow(["Days sales outstanding"]),
    csvRow(["Month", "DSO (days)"]),
    ...report.dso_series.map((point) => csvRow([point.month, point.days])),
    "",
    csvRow(["At risk next week"]),
    csvRow(["Account", "Invoice", "Amount (INR)", "Bucket", "Note"]),
    ...report.at_risk.map((row) =>
      csvRow([row.account_name, row.invoice_number, row.amount_outstanding, row.bucket, row.note]),
    ),
    "",
    csvRow(["Who to call on Monday"]),
    csvRow(["Account", "Reason"]),
    ...report.call_list.map((row) => csvRow([row.account_name, row.reason])),
    "",
    csvRow(["90+ days aged debt"]),
    csvRow(["Account", "Invoice", "Amount (INR)", "Days overdue"]),
    ...report.aged_debt.map((row) =>
      csvRow([row.account_name, row.invoice_number, row.amount_outstanding, row.days_overdue]),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** File name for the download, dated by the report's own `as_of` day. */
export function reportFileName(report: ReadyWeeklyReport): string {
  // `as_of` carries its own offset, so its first ten characters are already
  // the local calendar day the report was built for.
  return `weekly-report-${report.as_of.slice(0, 10)}.csv`;
}
