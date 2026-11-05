import type {
  EligibleInvoice,
  MatterDetail,
  MatterRoute,
  MatterStage,
  Seller,
  ThreadEntry,
} from "@/lib/schemas/legal";
/**
 * Pure rules behind Legal escalation and the matter record. No React, no
 * fetch — unit-tested in `legal-rules.test.ts`.
 */

/** Follow-ups an invoice needs before it can be escalated. */
export const MIN_FOLLOW_UPS = 4;

/** Rows the eligible list may offer. A shortfall is dropped, not a failed load. */
export function escalationEligible(items: readonly EligibleInvoice[]): EligibleInvoice[] {
  return items.filter((item) => item.follow_ups >= MIN_FOLLOW_UPS);
}

/** Money string → integer paise, without a float touching the paise. */
export function toPaise(value: string): bigint {
  const negative = value.trim().startsWith("-");
  const [whole = "0", fraction = ""] = value.trim().replace(/^-/, "").split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -paise : paise;
}

/** Integer paise → money string with two decimals. */
export function fromPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * The calendar date of an ISO timestamp in India.
 *
 * Pinned to Asia/Kolkata for the same reason `format.ts` pins its formatters:
 * the server and browser must agree on which day "as of" is.
 */
export function istDateOf(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoTimestamp));
}

/** Settle Swiftly's own charge per matter: document preparation and tracking. */
export const MATTER_FEE = "999.00";

/**
 * Whether the statutory routes (Section 43B(h), MSEFC) are open to this org.
 * Both protect micro and small enterprises registered on Udyam; registered
 * traders get priority-sector lending only, and medium enterprises are outside
 * the MSMED Act's delayed-payment chapter altogether.
 */
export function statutoryRoutesOpen(seller: Seller): boolean {
  return (
    seller.udyam_registered &&
    (seller.enterprise_size === "micro" || seller.enterprise_size === "small") &&
    !seller.is_trader
  );
}

/** How many recovery routes the ladder offers this org. */
export function routeCount(seller: Seller): number {
  return statutoryRoutesOpen(seller) ? 4 : 2;
}

export type EligibleSummary = { total: string; accountCount: number; oldestDays: number };

/** The figures across the top of the eligible list. */
export function eligibleSummary(items: readonly EligibleInvoice[]): EligibleSummary {
  const total = items.reduce((sum, item) => sum + toPaise(item.amount_outstanding), 0n);
  return {
    total: fromPaise(total),
    accountCount: new Set(items.map((item) => item.account_id)).size,
    oldestDays: items.reduce((max, item) => Math.max(max, item.days_overdue), 0),
  };
}

/** Ids of the rows that can be selected: no open matter, no lock. */
export function selectableIds(items: readonly EligibleInvoice[]): string[] {
  return items.filter((item) => item.lock === null).map((item) => item.invoice_id);
}

/** Count and total of the selected rows, ignoring any that are locked. */
export function selectionSummary(
  items: readonly EligibleInvoice[],
  selected: ReadonlySet<string>,
): { count: number; total: string; rows: EligibleInvoice[] } {
  const rows = items.filter((item) => item.lock === null && selected.has(item.invoice_id));
  const total = rows.reduce((sum, row) => sum + toPaise(row.amount_outstanding), 0n);
  return { count: rows.length, total: fromPaise(total), rows };
}

/** "A", "A and B", "A, B and C". Duplicate names are listed once. */
export function joinNames(names: readonly string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/** "this invoice qualifies" / "both invoices qualify" / "all 3 invoices qualify". */
export function qualifyLabel(count: number): string {
  if (count === 1) return "this invoice qualifies";
  if (count === 2) return "both invoices qualify";
  return `all ${count} invoices qualify`;
}

/** The advocate's fee plus Settle Swiftly's matter fee. */
export function totalMatterCost(noticeFee: string): string {
  return fromPaise(toPaise(noticeFee) + toPaise(MATTER_FEE));
}

/**
 * The demand paragraph the review screen starts from. Editable; the advocate
 * finalises the notice either way. The Section 16 clause appears only where
 * the statute actually applies.
 */
export function defaultDemandText(formattedTotal: string, statutory: boolean): string {
  const interest = statutory
    ? ", together with interest at three times the bank rate notified by the Reserve Bank of India under Section 16 of the MSMED Act, 2006,"
    : "";
  return `I therefore call upon you to pay ${formattedTotal}${interest} within 15 days of receipt of this notice, to my client's account as stated on the invoice.`;
}

const ROUTE_LABEL: Record<MatterRoute, string> = {
  section_43bh_notice: "43B(h) notice",
  msefc_reference: "MSEFC reference",
  advocate_notice: "Legal notice",
  summary_suit: "Summary suit",
};

/** The route as the matters list names it. */
export function routeLabel(route: MatterRoute): string {
  return ROUTE_LABEL[route];
}

const STAGE_LABEL: Record<MatterStage, string> = {
  awaiting_acceptance: "Awaiting advocate",
  notice_drafting: "Notice drafting",
  notice_issued: "Notice issued",
  awaiting_response: "Awaiting response",
  client_responded: "Client responded",
  recovered: "Recovered",
  closed: "Closed",
};

/** The stage as a badge names it. */
export function stageLabel(stage: MatterStage): string {
  return STAGE_LABEL[stage];
}

const deadlineFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

/** The matters-list line after an advocate moves the stage. */
export function nextStepForStage(stage: MatterStage, deadlineOn: string | null): string {
  if (stage === "recovered") return "Recovered";
  if (stage === "closed") return "Closed";
  if (stage === "notice_drafting") return "Draft the notice";
  if (stage === "client_responded") return "Review their reply";
  if (stage === "awaiting_acceptance") return "Waiting for the advocate to accept";
  if (deadlineOn && (stage === "notice_issued" || stage === "awaiting_response")) {
    const date = new Date(`${deadlineOn}T12:00:00+05:30`);
    if (!Number.isNaN(date.getTime())) return `Response due ${deadlineFormatter.format(date)}`;
  }
  if (stage === "notice_issued") return "Notice issued";
  return "Awaiting response";
}

/** The badge tone for a stage: warn when the business has something to read. */
export function stageTone(stage: MatterStage): "neutral" | "warn" | "green" {
  if (stage === "client_responded") return "warn";
  if (stage === "recovered") return "green";
  return "neutral";
}

/** Stages an advocate can move a matter to, in order. */
export const ADVOCATE_STAGES: readonly MatterStage[] = [
  "notice_drafting",
  "notice_issued",
  "awaiting_response",
  "client_responded",
  "recovered",
  "closed",
];

/** Whether a stage means the matter is over and the record is read-only. */
export function isClosedStage(stage: MatterStage): boolean {
  return stage === "recovered" || stage === "closed";
}

const STRIP_STEPS = [
  "Matter created",
  "Documents prepared",
  "Sent to advocate",
  "Notice issued",
  "Awaiting response",
] as const;

/** Index of the current step in the strip; past the end means all done. */
const STAGE_POSITION: Record<MatterStage, number> = {
  awaiting_acceptance: 2,
  notice_drafting: 3,
  notice_issued: 4,
  awaiting_response: 4,
  client_responded: 5,
  recovered: 5,
  closed: 5,
};

export type StripStep = { label: string; state: "done" | "current" | "todo" };

/**
 * The five-step strip under the matter header, and the one-line form mobile
 * uses: "Step 5 of 5 · Awaiting response".
 */
export function stageStrip(stage: MatterStage): { steps: StripStep[]; summary: string } {
  const position = STAGE_POSITION[stage];
  const steps = STRIP_STEPS.map((label, index) => ({
    label,
    state: index < position ? "done" : index === position ? "current" : "todo",
  })) as StripStep[];
  const summary =
    position >= STRIP_STEPS.length
      ? `All ${STRIP_STEPS.length} steps done · ${stageLabel(stage)}`
      : `Step ${position + 1} of ${STRIP_STEPS.length} · ${STRIP_STEPS[position]}`;
  return { steps, summary };
}

/** When an entry happened, whichever kind it is. */
function entryTime(entry: ThreadEntry): string {
  return entry.type === "message" ? entry.sent_at : entry.at;
}

const dayLabelFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

export type ThreadDay = { day: string; label: string; entries: ThreadEntry[] };

/**
 * The thread split into days, in Indian time, oldest first. A day separator
 * reads "28 July 2026". Entries are ordered by when they happened, so a
 * payload that arrives out of order still reads as one record.
 */
export function groupThreadByDay(entries: readonly ThreadEntry[]): ThreadDay[] {
  const ordered = [...entries].sort(
    (a, b) => new Date(entryTime(a)).getTime() - new Date(entryTime(b)).getTime(),
  );
  const days: ThreadDay[] = [];
  for (const entry of ordered) {
    const time = entryTime(entry);
    const day = istDateOf(time);
    const last = days[days.length - 1];
    if (last && last.day === day) {
      last.entries.push(entry);
    } else {
      days.push({ day, label: dayLabelFormatter.format(new Date(time)), entries: [entry] });
    }
  }
  return days;
}

const threadTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

/** "28 Jul, 10:02", in Indian time — the stamp on every message. */
export function formatThreadTime(iso: string): string {
  const parts = threadTimeFormatter.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")} ${get("month")}, ${get("hour")}:${get("minute")}`;
}

/** "340 KB", "2.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The largest file a matter accepts. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "docx", "xlsx"] as const;

/** The extension of a file name, lower-cased, or "" when it has none. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Why a file can't be attached, or null when it can. Messages name the file
 * and say what to do, per the voice rules.
 */
export function attachmentError(file: { name: string; size: number }): string | null {
  const extension = extensionOf(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(extension)) {
    return `${file.name} can't be attached. Use PDF, JPG, PNG, DOCX or XLSX.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is ${Math.round(file.size / (1024 * 1024))} MB. Maximum is 25 MB.`;
  }
  return null;
}

/** The glyph label a document card shows: PDF, IMG, DOC or XLS. */
export function fileBadge(name: string): string {
  const extension = extensionOf(name);
  if (extension === "pdf") return "PDF";
  if (extension === "jpg" || extension === "jpeg" || extension === "png") return "IMG";
  if (extension === "xlsx") return "XLS";
  return "DOC";
}

/** Documents in a matter, split by who added them. */
export function documentsBySide(detail: MatterDetail): {
  business: MatterDetail["documents"];
  advocate: MatterDetail["documents"];
} {
  return {
    business: detail.documents.filter((doc) => doc.added_by === "business"),
    advocate: detail.documents.filter((doc) => doc.added_by === "advocate"),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Invoice ids from the `?invoices=` search param. Anything that isn't a UUID
 * is dropped, so a hand-edited or stale link degrades to "nothing selected"
 * rather than failing the route.
 */
export function parseInvoiceIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((part) => part.trim()))].filter((id) => UUID.test(id));
}

/** The `?invoices=` value for a set of ids. */
export function serialiseInvoiceIds(ids: Iterable<string>): string {
  return [...ids].join(",");
}
