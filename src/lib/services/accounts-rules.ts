/**
 * Accounts business rules from `docs/accounts-contract.md` §2 and
 * `docs/account-settings-changes.md`, as pure functions.
 *
 * Like `dashboard-rules.ts`, nothing here reads the clock or the database: the
 * org-local `today` is passed in. `resolveChaseStatus` is THE answer to "can
 * this account be chased" — the dashboard's eligibility check uses it too, so
 * the P0 rule exists exactly once.
 */

import { formatINR } from "@/lib/format";
import type {
  AccountListItem,
  AccountsListFilter,
  CadenceChannel,
  CadenceRecipients,
  CadenceStep,
  CadenceTone,
  ChaseStatus,
  ChaseStatusLabel,
  ContactPip,
  ContactTier,
  DeliveryState,
  EscalationContact,
  InvoiceStatus,
  PaymentActionKind,
  PaymentTone,
  SendWindow,
} from "@/lib/schemas/accounts";
import {
  addDays,
  daysBetween,
  daysOverdue,
  paiseToMoney,
  promisePauseActive,
  promisePauseEnd,
  toPaise,
  type BookInvoice,
  type IsoDate,
} from "@/lib/services/dashboard-rules";

/** The contact fields the chase rules look at. */
export type ContactFacts = {
  tier: ContactTier;
  name: string;
  doNotContact: boolean;
  deliveryState: DeliveryState;
};

/** The account fields the chase rules look at. */
export type AccountChaseFacts = {
  pausedAt: string | null;
  pausedUntil: IsoDate | null;
  chaseMode: "default" | "custom" | "stopped";
};

/** Usable P0: tier P0 and not do-not-contact. A bounced P0 is still "usable" — it just can't deliver. */
function usableP0s(contacts: readonly ContactFacts[]): ContactFacts[] {
  return contacts.filter((contact) => contact.tier === "P0" && !contact.doNotContact);
}

/**
 * Paused by the header (paused_at set and paused_until null or not yet past),
 * or stopped from Settings. Both stop messages going out.
 */
export function isChasePaused(account: AccountChaseFacts, today: IsoDate): boolean {
  if (account.chaseMode === "stopped") return true;
  return (
    account.pausedAt !== null && (account.pausedUntil === null || account.pausedUntil >= today)
  );
}

/**
 * Contract §2.1 — first match wins. `no_p0` and `bounced_p0` share a label but
 * stay distinct: they need different fixes.
 */
export function resolveChaseStatus(
  account: AccountChaseFacts,
  contacts: readonly ContactFacts[],
  today: IsoDate,
): ChaseStatus {
  const usable = usableP0s(contacts);
  if (usable.length === 0) return "no_p0";
  if (usable.every((contact) => contact.deliveryState === "bounced")) return "bounced_p0";
  if (isChasePaused(account, today)) return "paused";
  return "active";
}

export const CHASE_STATUS_LABEL: Record<ChaseStatus, ChaseStatusLabel> = {
  no_p0: "Can't chase",
  bounced_p0: "Can't chase",
  paused: "Paused",
  active: "Active",
};

/**
 * One tier's pip: `present` if anyone on it can be reached, else `bounced` if
 * someone is only failing delivery, else `dnc` if everyone opted out, else
 * `missing`.
 */
export function contactPip(contacts: readonly ContactFacts[], tier: ContactTier): ContactPip {
  const onTier = contacts.filter((contact) => contact.tier === tier);
  if (onTier.length === 0) return "missing";
  if (onTier.some((c) => !c.doNotContact && c.deliveryState !== "bounced")) return "present";
  if (onTier.some((c) => !c.doNotContact)) return "bounced";
  return "dnc";
}

/** Header copy beside the sync line, composed here and rendered verbatim. */
export function headerStatus(
  status: ChaseStatus,
  account: AccountChaseFacts & { pauseReason: string | null; stopReason: string | null },
): string {
  switch (status) {
    case "no_p0":
      return "Can't chase — no primary contact";
    case "bounced_p0":
      return "Chasing paused — email bouncing";
    case "paused":
      if (account.chaseMode === "stopped") {
        return `Chasing stopped — ${account.stopReason ?? "Other"}`;
      }
      return account.pausedUntil === null
        ? `Chasing paused — ${account.pauseReason ?? "Other"}`
        : `Chasing paused — ${account.pauseReason ?? "Other"} until ${dayMonth(account.pausedUntil)}`;
    case "active":
      return "Active";
  }
}

/** A fully paid invoice's lateness sample: due date and the day it was settled. */
export type PaidSample = { dueDate: IsoDate; paidOn: IsoDate };

/** Minimum paid invoices before an average means anything (contract §2.2). */
export const AVG_DAYS_LATE_MIN_SAMPLES = 3;

/**
 * Contract §2.2: mean of (paid_on − due_date) over fully paid invoices settled
 * in the last 12 months, or null under three samples. Payment history, not
 * open exposure — null renders as an em dash, never as 0.
 */
export function avgDaysLate(samples: readonly PaidSample[], today: IsoDate): number | null {
  const since = addDays(today, -365);
  const recent = samples.filter((s) => s.paidOn >= since && s.paidOn <= today);
  if (recent.length < AVG_DAYS_LATE_MIN_SAMPLES) return null;
  const total = recent.reduce((sum, s) => sum + daysBetween(s.dueDate, s.paidOn), 0);
  return Math.round(total / recent.length);
}

/** Per-account money figures from its open book (contract §2.2). */
export function accountFigures(book: readonly BookInvoice[], today: IsoDate) {
  let outstanding = 0;
  let overdue = 0;
  let oldest: number | null = null;
  for (const invoice of book) {
    outstanding += invoice.outstandingPaise;
    const days = daysOverdue(invoice, today);
    if (days > 0) {
      overdue += invoice.outstandingPaise;
      oldest = oldest === null ? days : Math.max(oldest, days);
    }
  }
  return {
    outstandingPaise: outstanding,
    overduePaise: overdue,
    openCount: book.length,
    oldestOverdueDays: oldest,
  };
}

/** The status an open invoice shows on the account's Invoices tab. */
export function invoiceStatus(invoice: BookInvoice, today: IsoDate): InvoiceStatus {
  if (invoice.disputed) return "Disputed";
  if (promisePauseActive(invoice, today)) return "Promised";
  if (daysOverdue(invoice, today) <= 0) return "Not yet due";
  if (invoice.partiallyPaid) return "Partially paid";
  return "Open";
}

/**
 * Why the row's Chase button is disabled, or null when it is enabled.
 * Account-level blocks come first: they apply to every invoice on the account.
 */
export function chaseDisabledReason(
  invoice: BookInvoice,
  status: ChaseStatus,
  contacts: readonly ContactFacts[],
  today: IsoDate,
): string | null {
  if (status === "no_p0") return "Can't chase — no primary contact";
  if (status === "bounced_p0") {
    const bounced = usableP0s(contacts).find((c) => c.deliveryState === "bounced");
    return bounced
      ? `Can't chase — ${bounced.name}'s email is bouncing`
      : "Can't chase — the primary contact's email is bouncing";
  }
  if (status === "paused") return "Chasing is paused for this account";
  if (invoice.disputed) return "Disputed — resolve the dispute before chasing";
  if (promisePauseActive(invoice, today)) {
    const end = promisePauseEnd(invoice);
    return end ? `Promised — chasing resumes after ${dayMonth(end)}` : "Promised";
  }
  if (daysOverdue(invoice, today) <= 0) return "Not due yet";
  return null;
}

// ---------------------------------------------------------------------------
// Cadence, send window, escalation contacts
// ---------------------------------------------------------------------------

const EARLY_CHANNELS: CadenceChannel[] = ["email", "whatsapp", "both"];
const LATE_CHANNELS: CadenceChannel[] = ["email", "whatsapp", "both", "voice"];

/**
 * The org default cadence. There is no org cadence screen yet, so the default
 * is defined here; accounts store only their overrides. Voice is allowed on
 * the two late steps only — a cadence policy, mirrored by a table constraint.
 */
export const DEFAULT_CADENCE: readonly CadenceStep[] = [
  step("s1", "−3 days", "Gentle", "email", "p0", false),
  step("s2", "Due date", "Standard", "both", "p0", false),
  step("s3", "+7", "Standard", "both", "p0p1", false),
  step("s4", "+14", "Standard", "email", "p0p1", false),
  step("s5", "+30", "Firm", "email", "p0p1p2", true),
  step("s6", "+45", "Firm", "email", "p0p1p2", true),
];

export const DEFAULT_CADENCE_SUMMARY = "6 steps, −3 days to +45, email and WhatsApp";

export const DEFAULT_SEND_WINDOW: SendWindow = {
  opens_at: "10:00",
  closes_at: "18:00",
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
};

function step(
  key: string,
  label: string,
  tone: CadenceTone,
  channel: CadenceChannel,
  recipients: CadenceRecipients,
  late: boolean,
): CadenceStep {
  return {
    key,
    label,
    tone,
    channel,
    recipients,
    // Approval mode belongs to the Chasing module, which does not exist yet.
    needs_approval: false,
    allowed_channels: late ? [...LATE_CHANNELS] : [...EARLY_CHANNELS],
  };
}

/** A copy of the default cadence, safe to hand out. */
export function defaultSteps(): CadenceStep[] {
  return DEFAULT_CADENCE.map((s) => ({ ...s, allowed_channels: [...s.allowed_channels] }));
}

/** An account's stored override for one step. */
export type StepOverride = {
  key: string;
  tone: CadenceTone;
  channel: CadenceChannel;
  recipients: CadenceRecipients;
};

/** The default cadence with the account's overrides laid over it, in step order. */
export function mergeSteps(overrides: readonly StepOverride[]): CadenceStep[] {
  return defaultSteps().map((base) => {
    const override = overrides.find((o) => o.key === base.key);
    return override
      ? { ...base, tone: override.tone, channel: override.channel, recipients: override.recipients }
      : base;
  });
}

/**
 * Why a submitted step list is not acceptable, or null. Unknown keys and a
 * channel outside the step's `allowed_channels` are both refused — the voice
 * gate is policy, not presentation.
 */
export function stepOverridesProblem(overrides: readonly StepOverride[]): string | null {
  for (const override of overrides) {
    const base = DEFAULT_CADENCE.find((s) => s.key === override.key);
    if (!base) return "That cadence step doesn't exist.";
    if (!base.allowed_channels.includes(override.channel)) {
      return `Voice calls are only available from the ${DEFAULT_CADENCE[4]?.label ?? "+30"} step.`;
    }
  }
  return null;
}

/** Placeholder copy for an empty tier on the read-only escalation summary. */
const EMPTY_TIER_DETAIL: Record<ContactTier, string> = {
  P0: "Accounts payable contact",
  P1: "Finance head",
  P2: "Owner or director",
};

/** The contact fields the escalation summary shows. */
export type LadderContact = ContactFacts & {
  designation: string | null;
  channelEmail: boolean;
  channelWhatsapp: boolean;
  channelSms: boolean;
  sortOrder: number;
};

/** The Settings tab's read-only P0/P1/P2 summary: the first reachable contact per tier. */
export function escalationContacts(contacts: readonly LadderContact[]): EscalationContact[] {
  return (["P0", "P1", "P2"] as const).map((tier) => {
    const first = contacts
      .filter((c) => c.tier === tier && !c.doNotContact)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!first) return { tier, name: null, detail: EMPTY_TIER_DETAIL[tier] };
    const channels = [
      first.channelEmail ? "Email" : null,
      first.channelWhatsapp ? "WhatsApp" : null,
      first.channelSms ? "SMS" : null,
    ].filter((c): c is string => c !== null);
    const detail = [first.designation, channels.join(", ")].filter(Boolean).join(" · ");
    return { tier, name: first.name, detail: detail || EMPTY_TIER_DETAIL[tier] };
  });
}

// ---------------------------------------------------------------------------
// Accounts list: filters and sorting (contract §3)
// ---------------------------------------------------------------------------

/** Applies the list filters; several filters narrow together (AND). */
export function filterAccounts(
  items: readonly AccountListItem[],
  filters: readonly AccountsListFilter[],
): AccountListItem[] {
  return items.filter((item) =>
    filters.every((filter) => {
      if (filter === "has_overdue") return toPaise(item.overdue) > 0;
      if (filter === "missing_contacts") {
        return item.chase_status === "no_p0" || item.chase_status === "bounced_p0";
      }
      return item.chase_status === "paused";
    }),
  );
}

function compareRows(a: AccountListItem, b: AccountListItem, sort: string): number {
  switch (sort) {
    case "name":
      return a.name.localeCompare(b.name);
    case "overdue":
      return toPaise(a.overdue) - toPaise(b.overdue);
    case "open_count":
      return a.open_count - b.open_count;
    case "oldest_overdue_days":
      return (a.oldest_overdue_days ?? -1) - (b.oldest_overdue_days ?? -1);
    case "avg_days_late":
      return (a.avg_days_late ?? -1) - (b.avg_days_late ?? -1);
    case "contacts":
      return `${a.contacts.p0}:${a.contacts.p1}:${a.contacts.p2}`.localeCompare(
        `${b.contacts.p0}:${b.contacts.p1}:${b.contacts.p2}`,
      );
    case "chase_status":
      return a.chase_status.localeCompare(b.chase_status);
    default:
      return toPaise(a.outstanding) - toPaise(b.outstanding);
  }
}

/** Sorts by `sort`/`dir`, with name then id as tiebreaks so the order is stable. */
export function sortAccounts(
  items: readonly AccountListItem[],
  sort: string,
  dir: "asc" | "desc",
): AccountListItem[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...items].sort(
    (a, b) =>
      sign * compareRows(a, b, sort) ||
      a.name.localeCompare(b.name) ||
      a.account_id.localeCompare(b.account_id),
  );
}

// ---------------------------------------------------------------------------
// Payments tab
// ---------------------------------------------------------------------------

/** The label, tone and action a payment row shows. */
export type PaymentStatus = {
  label: string;
  tone: PaymentTone;
  actionLabel: string;
  actionKind: PaymentActionKind;
};

/**
 * What a payment against one invoice means for that invoice.
 *
 * A remaining balance that matches the account's expected TDS (on the gross,
 * or on the base before 18% GST — both conventions are in use) reads as a
 * TDS shortfall to reconcile, not a short payment to chase: that comparison
 * is the reason the expected TDS fields exist.
 */
export function paymentStatus(
  invoiceGrossPaise: number,
  invoiceBalancePaise: number,
  tdsRate: number | null,
): PaymentStatus {
  if (invoiceBalancePaise <= 0) {
    return {
      label: "Settled in full",
      tone: "muted",
      actionLabel: "View split",
      actionKind: "view_split",
    };
  }
  if (tdsRate !== null && tdsRate > 0) {
    const candidates = [invoiceGrossPaise, Math.round(invoiceGrossPaise / 1.18)].map((base) =>
      Math.round((base * tdsRate) / 100),
    );
    // ₹1 either way absorbs rounding in the customer's own TDS computation.
    if (candidates.some((expected) => Math.abs(invoiceBalancePaise - expected) <= 100)) {
      return {
        label: `TDS shortfall ${formatINR(paiseToMoney(invoiceBalancePaise))}`,
        tone: "warn",
        actionLabel: "Adjust",
        actionKind: "adjust",
      };
    }
  }
  return {
    label: `Part payment · ${formatINR(paiseToMoney(invoiceBalancePaise))} still due`,
    tone: "warn",
    actionLabel: "View split",
    actionKind: "view_split",
  };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

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

/** `2026-08-22` → `22 Aug`. */
function dayMonth(date: IsoDate): string {
  const [, month, day] = date.split("-");
  return `${Number(day)} ${SHORT_MONTHS[Number(month) - 1] ?? ""}`;
}

/** The org-local calendar date and HH:MM of an instant. */
function localParts(instant: Date, timeZone: string): { date: IsoDate; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/**
 * The activity feed's time label, in the org's timezone: `Just now`,
 * `Today · 09:12`, `Yesterday · 18:40`, `12 Aug · 16:40`, or with the year
 * once it is not the current one.
 */
export function activityWhenLabel(occurredAt: string, timeZone: string, now: Date): string {
  const instant = new Date(occurredAt);
  if (now.getTime() - instant.getTime() < 60_000 && now.getTime() >= instant.getTime()) {
    return "Just now";
  }
  let at: { date: IsoDate; time: string };
  let today: { date: IsoDate; time: string };
  try {
    at = localParts(instant, timeZone);
    today = localParts(now, timeZone);
  } catch {
    at = localParts(instant, "Asia/Kolkata");
    today = localParts(now, "Asia/Kolkata");
  }
  if (at.date === today.date) return `Today · ${at.time}`;
  if (at.date === addDays(today.date, -1)) return `Yesterday · ${at.time}`;
  const [year, month, day] = at.date.split("-");
  const label = `${day} ${SHORT_MONTHS[Number(month) - 1] ?? ""}`;
  return year === today.date.slice(0, 4) ? `${label} · ${at.time}` : `${label} ${year}`;
}
