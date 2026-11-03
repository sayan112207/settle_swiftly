/**
 * Dashboard business rules from `docs/api-contract.md` §2, as pure functions.
 *
 * Nothing here touches the database or the clock: every function takes the
 * org-local `today` it should reason about. That is what lets the tests pin a
 * date, and it keeps the "which day is it" question in exactly one place —
 * `todayInTimezone` — rather than scattered `new Date()` calls that would each
 * silently use the server's zone.
 *
 * Money is carried as integer paise (`number`). `numeric(15,2)` tops out below
 * 10^15 paise, inside the 2^53 range where integer arithmetic on doubles is
 * exact, so summing paise never drifts the way summing rupee floats would.
 */

import type { AgingBucket, PriorityBand } from "@/lib/schemas/dashboard";

/** An ISO calendar date, `YYYY-MM-DD`. Compared and subtracted as a date, never as an instant. */
export type IsoDate = string;

/** Everything the rules need to know about one invoice with a balance. */
export type BookInvoice = {
  id: string;
  accountId: string;
  accountName: string;
  invoiceNumber: string;
  dueDate: IsoDate;
  /** Gross amount minus payments, in paise. Always > 0 for invoices in the book. */
  outstandingPaise: number;
  /** Any payment received and a balance still left. */
  partiallyPaid: boolean;
  disputed: boolean;
  promisedDate: IsoDate | null;
  promisedAt: IsoDate | null;
  promiseBrokenCount: number;
  lastPromiseBrokenAt: IsoDate | null;
  /** Reminders actually sent, and the org-local date of the latest one. */
  reminderCount: number;
  lastReminderOn: IsoDate | null;
  /** The account's chase gates, resolved by the loader. */
  accountPaused: boolean;
  accountHasUsableP0: boolean;
};

/** Contract §2.3. Kept together so the bands can be tuned without a code hunt. */
export const BAND_ESCALATE = 1.6;
export const BAND_CHASE_NOW = 1.0;

/** Contract §2.2: a promise pauses chasing for at most this many days from when it was recorded. */
export const PROMISE_PAUSE_CAP_DAYS = 45;

/** Below this many eligible invoices a 95th percentile is noise; use the max instead. */
export const P95_MIN_SAMPLE = 15;

const MS_PER_DAY = 86_400_000;

function isoToUtcMs(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoToUtcMs(to) - isoToUtcMs(from)) / MS_PER_DAY);
}

/** `date` shifted by `days`, as an ISO date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(isoToUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The calendar date at `instant` in `timeZone`, as `YYYY-MM-DD`.
 *
 * An unknown zone name falls back to Asia/Kolkata, the column default, rather
 * than throwing: a bad org setting should not take the whole dashboard down.
 */
export function todayInTimezone(timeZone: string, instant: Date = new Date()): IsoDate {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  try {
    return format(timeZone);
  } catch {
    return format("Asia/Kolkata");
  }
}

/** Days past due as of `today`. Zero or negative means not yet due. Derives from due_date alone. */
export function daysOverdue(invoice: Pick<BookInvoice, "dueDate">, today: IsoDate): number {
  return daysBetween(invoice.dueDate, today);
}

/**
 * The last day a promise keeps the invoice out of the queue, or null when
 * there is no promise that pauses anything.
 *
 * A promise dated before it was recorded is "treated as immediate — no pause",
 * so it yields null rather than a pause that ended in the past.
 */
export function promisePauseEnd(
  invoice: Pick<BookInvoice, "promisedDate" | "promisedAt">,
): IsoDate | null {
  const { promisedDate, promisedAt } = invoice;
  if (promisedDate === null || promisedAt === null) return null;
  if (promisedDate < promisedAt) return null;
  const cap = addDays(promisedAt, PROMISE_PAUSE_CAP_DAYS);
  return promisedDate < cap ? promisedDate : cap;
}

/** True while a promise is pausing the chase: `today <= min(promised_date, promised_at + 45)`. */
export function promisePauseActive(
  invoice: Pick<BookInvoice, "promisedDate" | "promisedAt">,
  today: IsoDate,
): boolean {
  const end = promisePauseEnd(invoice);
  return end !== null && today <= end;
}

/** Why an invoice is not chaseable, or null when it is. Order is the order of the checks. */
export type IneligibleReason =
  "Account paused" | "Disputed" | "Promise pending" | "Not yet due" | "No usable P0 contact";

/**
 * Contract §2.1 — the one chase-eligibility check.
 *
 * Everything else (the queue, the POST re-validation, the summary's counts)
 * calls this; nothing reimplements any part of it. Invoices that are paid,
 * void, draft or written off never reach here — the loader only builds a
 * `BookInvoice` for something with a balance.
 */
export function ineligibleReason(invoice: BookInvoice, today: IsoDate): IneligibleReason | null {
  if (invoice.accountPaused) return "Account paused";
  if (invoice.disputed) return "Disputed";
  if (promisePauseActive(invoice, today)) return "Promise pending";
  if (daysOverdue(invoice, today) <= 0) return "Not yet due";
  if (!invoice.accountHasUsableP0) return "No usable P0 contact";
  return null;
}

/** The chaseable subset of the book, in input order. */
export function eligibleInvoices(book: readonly BookInvoice[], today: IsoDate): BookInvoice[] {
  return book.filter((invoice) => ineligibleReason(invoice, today) === null);
}

/** Contract order; the frontend renders this left to right and never sorts. */
export const AGING_BUCKETS = ["Not yet due", "1–30", "31–60", "61–90", "90+"] as const;

/**
 * Contract §2.5, with §2.2's promise rule: an invoice under an active promise
 * is a live conversation and never lands in 90+, however old it is. It is held
 * in 61–90 so it still counts toward the total — the buckets must always sum
 * to total outstanding.
 */
export function agingBucket(invoice: BookInvoice, today: IsoDate): AgingBucket {
  const days = daysOverdue(invoice, today);
  if (days <= 0) return "Not yet due";
  if (days <= 30) return "1–30";
  if (days <= 60) return "31–60";
  if (days <= 90) return "61–90";
  return promisePauseActive(invoice, today) ? "61–90" : "90+";
}

/**
 * Paise per bucket, in contract order. Covers every invoice in the book —
 * disputed and promised included — because aging is exposure, not chaseability.
 */
export function agingTotals(
  book: readonly BookInvoice[],
  today: IsoDate,
): Array<{ bucket: AgingBucket; paise: number }> {
  const totals = new Map<AgingBucket, number>(AGING_BUCKETS.map((bucket) => [bucket, 0]));
  for (const invoice of book) {
    const bucket = agingBucket(invoice, today);
    totals.set(bucket, (totals.get(bucket) ?? 0) + invoice.outstandingPaise);
  }
  return AGING_BUCKETS.map((bucket) => ({ bucket, paise: totals.get(bucket) ?? 0 }));
}

/** The value normaliser for one org: p95 of eligible balances, or the max at low volume. */
export function valueScale(eligible: readonly BookInvoice[]): number {
  if (eligible.length === 0) return 0;
  const amounts = eligible.map((invoice) => invoice.outstandingPaise).sort((a, b) => a - b);
  if (eligible.length < P95_MIN_SAMPLE) return amounts[amounts.length - 1] ?? 0;
  // Nearest-rank percentile: the smallest value with at least 95% at or below it.
  const rank = Math.ceil(0.95 * amounts.length) - 1;
  return amounts[rank] ?? 0;
}

/** Days since the last sent reminder, or null when none has been sent. */
function daysSinceLastReminder(invoice: BookInvoice, today: IsoDate): number | null {
  return invoice.lastReminderOn === null ? null : daysBetween(invoice.lastReminderOn, today);
}

function secondReminderUnanswered(invoice: BookInvoice, today: IsoDate): boolean {
  const since = daysSinceLastReminder(invoice, today);
  return invoice.reminderCount >= 2 && since !== null && since > 7;
}

export type ScoredInvoice = {
  invoice: BookInvoice;
  daysOverdue: number;
  valueNorm: number;
  score: number;
  band: PriorityBand;
  reason: string;
};

/** Contract §2.3 band thresholds. */
export function priorityBand(score: number): PriorityBand {
  if (score >= BAND_ESCALATE) return "Escalate";
  if (score >= BAND_CHASE_NOW) return "Chase now";
  return "Watch";
}

const SHORT_MONTHS = [
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

/** `2026-08-08` → `8 Aug`: strftime `%-d %b`, without locale surprises. */
function dayMonth(date: IsoDate): string {
  const [, month, day] = date.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? ""}`;
}

/**
 * Contract §2.4 — first match wins, exact strings.
 *
 * `isLargest` is decided by the caller because it is a property of the whole
 * queue, not of one invoice.
 */
export function priorityReason(
  invoice: BookInvoice,
  context: { today: IsoDate; days: number; valueNorm: number; isLargest: boolean },
): string {
  const { today, days, valueNorm, isLargest } = context;
  if (invoice.promiseBrokenCount >= 1 && invoice.lastPromiseBrokenAt !== null) {
    return `Promise broken on ${dayMonth(invoice.lastPromiseBrokenAt)}`;
  }
  if (secondReminderUnanswered(invoice, today)) return "Second reminder went unanswered";
  if (isLargest) return `Largest overdue balance, ${days} days`;
  if (days === 44) return "Crosses the 45-day mark tomorrow";
  if (days >= 60 && valueNorm < 0.2) return `Small amount but ${days} days old`;
  if (invoice.reminderCount === 0) return "Small balance, first reminder due";
  return `${days} days overdue`;
}

/**
 * Scores and ranks already-eligible invoices (contract §2.3), highest first,
 * with larger balance as the tiebreak and invoice id last so the order is
 * stable between requests.
 */
export function scoreQueue(eligible: readonly BookInvoice[], today: IsoDate): ScoredInvoice[] {
  const scale = valueScale(eligible);
  const largest = eligible.reduce((max, invoice) => Math.max(max, invoice.outstandingPaise), 0);

  const scored = eligible.map((invoice): ScoredInvoice => {
    const days = daysOverdue(invoice, today);
    const valueNorm = scale === 0 ? 0 : Math.min(invoice.outstandingPaise / scale, 1);
    const urgencyNorm = Math.min(days / 60, 1);

    let modifier = 1;
    if (invoice.promiseBrokenCount >= 1) modifier *= 1.25;
    if (invoice.promiseBrokenCount >= 3) modifier *= 1.15;
    if (secondReminderUnanswered(invoice, today)) modifier *= 1.15;
    if (invoice.partiallyPaid) modifier *= 0.85;

    const score = (0.5 + urgencyNorm) * (0.5 + valueNorm) * modifier;
    return {
      invoice,
      daysOverdue: days,
      valueNorm,
      score,
      band: priorityBand(score),
      reason: priorityReason(invoice, {
        today,
        days,
        valueNorm,
        isLargest: largest > 0 && invoice.outstandingPaise === largest,
      }),
    };
  });

  return scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.invoice.outstandingPaise - a.invoice.outstandingPaise ||
      a.invoice.id.localeCompare(b.invoice.id),
  );
}

/** Integer paise → the contract's decimal string, e.g. 184000000 → "1840000.00". */
export function paiseToMoney(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** A `numeric(15,2)` value as PostgREST sends it (a JSON number) → integer paise. */
export function toPaise(amount: number | string): number {
  return Math.round(Number(amount) * 100);
}

/** Share of `part` in `whole` as a percentage with one decimal; 0 when the whole is 0. */
export function sharePct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
