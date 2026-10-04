/**
 * Display formatters. These produce strings for humans to read — never parse
 * their output back into a number.
 */

import type { InvoiceStatus } from "@/lib/schemas/accounts";

/** Render-time label — `Overdue` is derived, not part of `invoiceStatusSchema`. */
export type InvoiceStatusDisplay = InvoiceStatus | "Overdue";

/**
 * Maps wire status to display copy. `Open` with positive `daysOverdue` reads as
 * `Overdue` — overdue-ness is not duplicated in the enum.
 */
export function invoiceStatusLabel(
  status: InvoiceStatus,
  daysOverdue: number,
): InvoiceStatusDisplay {
  if (status === "Open" && daysOverdue > 0) {
    return "Overdue";
  }
  return status;
}

// Built once at module scope: constructing an Intl formatter is expensive
// relative to calling it, and an invoice table formats one per row.
//
// Both fraction digits are pinned to 2, so whole amounts render ₹4,82,000.00
// rather than ₹4,82,000. Fixed width is the point: in a right-aligned money
// column, mixed precision puts the decimal points on different axes and the
// column stops being scannable. It also stops a stored 125000.50 from
// displaying as ₹1,25,001, which is a different number.
const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Renders a rupee amount using the Indian digit grouping (lakh/crore), so
 * 1840000 reads as ₹18,40,000.00 rather than ₹1,840,000.
 *
 * Takes a string because money arrives from Postgres `numeric` columns as a
 * string — going through a float in transit is what loses paise. Paise are
 * shown; keep the original string for anything that has to add up.
 *
 * The sign is placed outside the symbol (-₹50,000.00, not ₹-50,000.00) for the
 * credit notes and refunds that come back negative.
 */
export function formatINR(value: string): string {
  // Blank is checked separately because Number("") and Number("   ") are 0,
  // not NaN — so an empty amount would slip past the finite check below and
  // render ₹0.00, stating a number nobody entered. The draft table formats
  // raw form input, where an empty amount field is an ordinary thing to hit.
  if (value.trim() === "") return "—";

  const amount = Number(value);
  // A malformed amount is a bug upstream, but rendering "₹NaN" in a table is
  // worse than an em dash — and returning ₹0 would quietly state a falsehood.
  if (!Number.isFinite(amount)) return "—";

  const sign = amount < 0 ? "-" : "";
  return `${sign}₹${inrFormatter.format(Math.abs(amount))}`;
}

/** Spec §7: zero renders as ₹0.00 in muted ink, never as an em dash. */
export function isZeroMoney(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value);
}

/**
 * Renders a day count with its unit: 1 → "1 day", 30 → "30 days".
 *
 * Rounded because the inputs include computed averages such as days-to-pay,
 * where "34.2 days" is more precision than the number deserves.
 */
export function formatDays(n: number): string {
  if (!Number.isFinite(n)) return "—";

  const days = Math.round(n);
  return `${days} ${Math.abs(days) === 1 ? "day" : "days"}`;
}

/**
 * The locale and time zone are both pinned rather than taken from the runtime.
 *
 * This is a correctness requirement, not a preference: these strings are
 * rendered on the server and again on the client, and a formatter that reads
 * the ambient time zone produces two different strings for the same timestamp,
 * which React reports as a hydration mismatch. Per-user time zones are a real
 * feature and need a stored preference, not `Intl` guessing.
 */
const DISPLAY_LOCALE = "en-IN";
const DISPLAY_TIME_ZONE = "Asia/Kolkata";

const calendarDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Whole calendar days between an ISO timestamp and `now` in Asia/Kolkata. */
export function formatCalendarDaysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Number.NaN;

  const today = calendarDayFormatter.format(now);
  const thatDay = calendarDayFormatter.format(then);
  const todayUtc = Date.parse(`${today}T00:00:00Z`);
  const thatUtc = Date.parse(`${thatDay}T00:00:00Z`);
  return Math.round((todayUtc - thatUtc) / 86_400_000);
}

/** Spec §2 sync copy: "Data synced 2 days ago". */
export function formatDataSyncedLabel(iso: string, now: Date = new Date()): string {
  const days = formatCalendarDaysSince(iso, now);
  if (!Number.isFinite(days) || days < 0) return "Data sync unknown";
  if (days === 0) return "Data synced today";
  if (days === 1) return "Data synced 1 day ago";
  return `Data synced ${days} days ago`;
}

/** Spec §6 activity timestamps: "9 days ago", "2 months ago". */
export function formatRelativeTimestamp(iso: string, now: Date = new Date()): string {
  const days = formatCalendarDaysSince(iso, now);
  if (!Number.isFinite(days) || days < 0) return "—";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;

  const months = Math.round(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;

  const years = Math.round(days / 365);
  if (years === 1) return "1 year ago";
  return `${years} years ago`;
}

/** Spec §2: sync older than 7 days is the stale-data variant. */
export function isSyncStale(iso: string, now: Date = new Date()): boolean {
  const days = formatCalendarDaysSince(iso, now);
  return Number.isFinite(days) && days >= 7;
}

const longDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: DISPLAY_TIME_ZONE,
});

const timeOfDayFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: DISPLAY_TIME_ZONE,
});

const shortDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: DISPLAY_TIME_ZONE,
});

/** An ISO timestamp as "Monday, 17 August". */
export function formatLongDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return longDateFormatter.format(date);
}

/** A plain calendar date (`YYYY-MM-DD`) as "6 Aug 2026". */
export function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return "—";
  return shortDateFormatter.format(date);
}

/** An ISO timestamp as "09:12", 24-hour. */
export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return timeOfDayFormatter.format(date);
}

const hourFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: DISPLAY_TIME_ZONE,
});

/**
 * The time-of-day greeting: "Good morning" through to "Working late".
 *
 * The hour is read in the pinned display time zone rather than the runtime's,
 * which is what makes this safe to render on the server. A server in UTC
 * deciding the greeting for a user in India would say "Good morning" at 3pm
 * their time, and would disagree with the browser at hydration.
 *
 * Takes the clock as an argument so it can be tested at a boundary instead of
 * only at whatever time the suite happens to run.
 */
export function formatGreeting(now: Date = new Date()): string {
  const hour = Number(hourFormatter.format(now));

  // The small hours are tested first. Ordered the other way round, midnight to
  // 04:59 falls through the morning check and lands on "Good afternoon".
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Working late";
}

/**
 * The name to greet someone by, from a full display name: "Priya Menon" → "Priya".
 *
 * Returns "" when there is nothing usable, which callers must handle by
 * dropping the name rather than substituting the email — "Good morning,
 * ops@acme.co" is worse than "Good morning". A display name is empty whenever
 * the profile row is missing or hidden by RLS.
 */
export function formatFirstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

/**
 * Days-overdue for a chase row. Spec §7: never `0 days` — a non-overdue
 * invoice reads `Not yet due`. `formatDays` stays the general counter (averages
 * can be zero); this is the one the table uses.
 */
export function formatOverdueDays(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n <= 0) return "Not yet due";
  return formatDays(n);
}
