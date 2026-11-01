/**
 * The chasing scheduler's decisions, as pure functions.
 *
 * See docs/chasing-scheduler-spec.md — §4 (which step), §5 (gates), §8 (the
 * daily schedule) and §9 (retries). Like the other `*-rules.ts` modules,
 * nothing here reads the clock, the network or the database: the planner and
 * sender load the facts, this decides what they mean, and the tests pin the
 * cases that are easy to get wrong — the backlog, the watermark, a retry
 * holding the ladder.
 */

import type {
  CadenceChannel,
  CadenceRecipients,
  CadenceStep,
  CadenceTone,
  ChaseStatus,
  SendWindow,
} from "@/lib/schemas/accounts";
import {
  daysBetween,
  promisePauseActive,
  todayInTimezone,
  type BookInvoice,
  type IsoDate,
} from "@/lib/services/dashboard-rules";
import type { DeliveryOutcome } from "@/lib/services/email-rules";
import type { Outbox, OutboxReminder } from "@/lib/schemas/outbox";

/** Spec §8: the schedule is fixed to India time, and "today" is the IST date. */
export const SCHEDULER_TIMEZONE = "Asia/Kolkata";

/** Spec §9: how long a reminder that is not landing keeps being retried. */
export const RETRY_WINDOW_DAYS = 7;

/** Spec §9: how close a delivery event must be to a send that threw to count as its own. */
export const UNKNOWN_OUTCOME_MATCH_MINUTES = 15;

/** Spec §6: a claim older than this belongs to a run that died. */
export const CLAIM_LEASE_MINUTES = 15;

/**
 * Emails the sender leaves unspent each cycle (spec §7). The quota is shared
 * with Supabase Auth's verification mail, and a user who cannot confirm their
 * address cannot sign in to see why their reminders stopped.
 */
export const QUOTA_RESERVE = 25;

/**
 * Days from the anchor (the due date) at which each step falls due.
 *
 * Kept beside the step keys rather than parsed out of the labels: a label is
 * copy, with a Unicode minus in it, and someone will reword it (spec §4).
 */
export const STEP_OFFSET_DAYS: Readonly<Record<string, number>> = {
  s1: -3,
  s2: 0,
  s3: 7,
  s4: 14,
  s5: 30,
  s6: 45,
};

/** Whether a step's channel includes email — the only channel that can send today. */
export function sendsEmail(channel: CadenceChannel): boolean {
  return channel === "email" || channel === "both";
}

/** The database's tone enum for a cadence tone. */
export type ReminderTone = "gentle" | "standard" | "firm";

/** Cadence tone → `reminder_tone`. */
export function toReminderTone(tone: CadenceTone): ReminderTone {
  return tone.toLowerCase() as ReminderTone;
}

/** `reminder_tone` → cadence tone, for the copy. */
export function toCadenceTone(tone: ReminderTone): CadenceTone {
  return (tone.charAt(0).toUpperCase() + tone.slice(1)) as CadenceTone;
}

// ---------------------------------------------------------------------------
// Time, in IST
// ---------------------------------------------------------------------------

/** The scheduler's "today": the IST date at `now`. */
export function schedulerToday(now: Date): IsoDate {
  return todayInTimezone(SCHEDULER_TIMEZONE, now);
}

const WEEKDAY_BY_UTC_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Whether the account sends at all on `today`. The planner's question: on a
 * day outside the window nothing is planned, and the step is still due on the
 * next window day.
 */
export function isWindowDay(window: SendWindow, today: IsoDate): boolean {
  const weekday = WEEKDAY_BY_UTC_DAY[new Date(`${today}T00:00:00Z`).getUTCDay()];
  return weekday !== undefined && window.days.includes(weekday);
}

/**
 * Whether the account's window is open at `now`, in IST. The sender's
 * question, asked every hour from 09:00 — so an account whose window opens at
 * 11 is reached at 11.
 */
export function isWindowOpen(window: SendWindow, now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHEDULER_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = part("weekday");
  const time = `${part("hour")}:${part("minute")}`;
  return (
    window.days.some((day) => day === weekday) && time >= window.opens_at && time < window.closes_at
  );
}

// ---------------------------------------------------------------------------
// Gates (spec §5)
// ---------------------------------------------------------------------------

/**
 * Why nothing should go out for this invoice today, or null.
 *
 * Built from the account's resolved status and the invoice's own dispute and
 * promise state — the same facts `ineligibleReason` reads, minus its
 * "Not yet due", which would refuse a cadence that starts three days early.
 */
export function holdReason(
  status: ChaseStatus,
  invoice: Pick<BookInvoice, "disputed" | "promisedDate" | "promisedAt">,
  today: IsoDate,
): string | null {
  if (status === "no_p0") return "No usable primary contact";
  if (status === "bounced_p0") return "The primary contact's email is bouncing";
  if (status === "paused") return "Chasing is paused for this account";
  if (invoice.disputed) return "Disputed";
  if (promisePauseActive(invoice, today)) return "Payment promised";
  return null;
}

// ---------------------------------------------------------------------------
// What happened to one recipient (spec §9)
// ---------------------------------------------------------------------------

export type RecipientOutcome = "unsent" | "accepted" | "delivered" | "hard_bounced" | "retry";

/** One `email_sends` row, with the classified events that belong to it. */
export type SendAttempt = {
  status: "queued" | "sent" | "failed";
  createdAt: string;
  error: string | null;
  /**
   * Events linked to this send — plus, for a send that failed, any unlinked
   * event to the same address within `UNKNOWN_OUTCOME_MATCH_MINUTES` of it,
   * which is how a send that threw but did land is recognised.
   */
  events: readonly { outcome: DeliveryOutcome; occurredAt: string }[];
};

/**
 * Derives a recipient's outcome from every attempt at reaching them for one
 * reminder. Delivered anywhere wins, then a hard bounce; otherwise the latest
 * attempt decides.
 */
export function recipientOutcome(attempts: readonly SendAttempt[]): {
  outcome: RecipientOutcome;
  reason: string | null;
} {
  if (attempts.length === 0) return { outcome: "unsent", reason: null };

  // Delivered and hard-bounced are both final, so whichever came last is the
  // truth: an address that took the first attempt and bounced a later one
  // no longer exists, and showing it as delivered would hide that.
  const final = attempts
    .flatMap((a) => a.events)
    .filter((e) => e.outcome === "delivered" || e.outcome === "hard_bounce")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .at(-1);
  if (final?.outcome === "delivered") return { outcome: "delivered", reason: null };
  if (final?.outcome === "hard_bounce") {
    return { outcome: "hard_bounced", reason: "The address doesn't exist" };
  }

  const latest = [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  if (!latest) return { outcome: "unsent", reason: null };

  if (latest.status === "failed") {
    return { outcome: "retry", reason: latest.error ?? "The email service refused it" };
  }
  // Written, never finished: the run died between recording and sending.
  if (latest.status === "queued") return { outcome: "retry", reason: "The send was interrupted" };

  const verdict = [...latest.events]
    .filter((e) => e.outcome !== "other")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .at(-1);
  if (verdict?.outcome === "soft_bounce") {
    return { outcome: "retry", reason: "The recipient's mail server turned it away for now" };
  }
  if (verdict?.outcome === "sender_rejected") {
    return { outcome: "retry", reason: "The email service refused to send it" };
  }
  return { outcome: "accepted", reason: null };
}

// ---------------------------------------------------------------------------
// Planning one invoice (spec §4, §9)
// ---------------------------------------------------------------------------

export type ReminderStatus = "scheduled" | "sent" | "failed" | "cancelled";

/** A reminder row with each recipient's derived outcome. */
export type ReminderFacts = {
  id: string;
  step: number;
  status: ReminderStatus;
  /** IST date the reminder was first planned; the retry week counts from here. */
  plannedOn: IsoDate;
  recipients: readonly { contactId: string; outcome: RecipientOutcome; reason: string | null }[];
};

/**
 * Whether a reminder still has work to do: never settled, or sent within the
 * retry week and since soft-bounced for somebody.
 */
export function isOutstanding(reminder: ReminderFacts, today: IsoDate): boolean {
  if (reminder.status === "scheduled" || reminder.status === "failed") return true;
  return (
    reminder.status === "sent" &&
    daysBetween(reminder.plannedOn, today) < RETRY_WINDOW_DAYS &&
    reminder.recipients.some((r) => r.outcome === "retry")
  );
}

export type PlanAction =
  /** Never attempted and no longer wanted: a hold, or a week without a chance to send. */
  | { type: "cancel"; reminderId: string; reason: string }
  /** Out of retries. `sent` if anybody received it, else `cancelled`; alert the rest. */
  | {
      type: "give_up";
      reminderId: string;
      status: "sent" | "cancelled";
      reason: string;
      failing: { contactId: string; reason: string }[];
    }
  /** Put back in today's queue. */
  | { type: "retry"; reminderId: string; status: "scheduled" | "failed" }
  /** A new step, to `schedule_reminder()`. */
  | {
      type: "schedule";
      stepKey: string;
      stepNumber: number;
      tone: CadenceTone;
      recipients: CadenceRecipients;
    }
  /** The step that is due cannot go by email. Reported, never sent as email instead. */
  | { type: "skip"; stepKey: string; reason: string };

export type PlanInput = {
  today: IsoDate;
  /** Days since the ladder's day zero; negative before the due date. */
  daysSinceAnchor: number;
  /** The account's effective cadence, in step order. */
  steps: readonly CadenceStep[];
  /** From `holdReason`. */
  hold: string | null;
  /** From `isWindowDay`. */
  windowDay: boolean;
  reminders: readonly ReminderFacts[];
};

/**
 * Today's actions for one invoice.
 *
 * Phase 1 first: an outstanding reminder is retried, or given up on, before
 * anything new — a failed s4 must not be passed over for s5, escalating on a
 * message the customer never got. Then phase 2: the highest step that is due
 * and above the watermark, or nothing. The watermark is what makes a skipped
 * backlog stay skipped instead of arriving in reverse, one step a day.
 */
export function planInvoice(input: PlanInput): PlanAction[] {
  const { today, hold, windowDay } = input;
  const actions: PlanAction[] = [];
  const settled = new Set<string>();

  const outstanding = input.reminders
    .filter((r) => isOutstanding(r, today))
    .sort((a, b) => a.step - b.step)[0];

  if (outstanding) {
    const attempted = outstanding.recipients.some((r) => r.outcome !== "unsent");
    const expired = daysBetween(outstanding.plannedOn, today) >= RETRY_WINDOW_DAYS;

    if (expired) {
      settled.add(outstanding.id);
      if (!attempted) {
        actions.push({
          type: "cancel",
          reminderId: outstanding.id,
          reason: `Not sent within ${RETRY_WINDOW_DAYS} days of being planned`,
        });
      } else {
        const reached = outstanding.recipients.some(
          (r) => r.outcome === "delivered" || r.outcome === "accepted",
        );
        actions.push({
          type: "give_up",
          reminderId: outstanding.id,
          status: reached ? "sent" : "cancelled",
          reason: `Not delivered after ${RETRY_WINDOW_DAYS} days`,
          failing: outstanding.recipients
            .filter((r) => r.outcome === "retry")
            .map((r) => ({ contactId: r.contactId, reason: r.reason ?? "Not delivered" })),
        });
      }
      // Falls through: the ladder continues at the next step (spec §4).
    } else if (hold !== null) {
      // A hold is not a failure. A reminder nobody has tried yet steps aside
      // quietly; one with failed attempts waits out its week.
      if (!attempted) {
        actions.push({ type: "cancel", reminderId: outstanding.id, reason: hold });
      }
      return actions;
    } else if (!windowDay) {
      return actions;
    } else {
      actions.push({
        type: "retry",
        reminderId: outstanding.id,
        status: attempted ? "failed" : "scheduled",
      });
      return actions;
    }
  }

  if (hold !== null || !windowDay) return actions;

  const watermark = input.reminders
    .filter((r) => r.status === "sent" || r.status === "cancelled" || settled.has(r.id))
    .reduce((max, r) => Math.max(max, r.step), 0);

  const latestDue = input.steps
    .map((step, index) => ({ step, number: index + 1 }))
    .filter(
      ({ step, number }) =>
        number > watermark &&
        (STEP_OFFSET_DAYS[step.key] ?? Number.POSITIVE_INFINITY) <= input.daysSinceAnchor,
    )
    .at(-1);
  if (!latestDue) return actions;

  const { step, number } = latestDue;
  if (!sendsEmail(step.channel)) {
    actions.push({
      type: "skip",
      stepKey: step.key,
      reason:
        step.channel === "voice"
          ? "Voice calls aren't available yet"
          : "WhatsApp sending isn't available yet",
    });
    return actions;
  }

  actions.push({
    type: "schedule",
    stepKey: step.key,
    stepNumber: number,
    tone: step.tone,
    recipients: step.recipients,
  });
  return actions;
}

// ---------------------------------------------------------------------------
// Sending one reminder
// ---------------------------------------------------------------------------

/** The contact fields that decide whether a recipient can be mailed right now. */
export type ContactReach = {
  isActive: boolean;
  doNotContact: boolean;
  email: string | null;
  channelEmail: boolean;
};

/**
 * Whether to mail this recipient in this run: they still need it, and they
 * can still be reached. Rechecked at send time because a contact can be
 * retired or opt out between the 8 o'clock plan and the send.
 */
export function needsSend(outcome: RecipientOutcome, contact: ContactReach | null): boolean {
  if (outcome !== "unsent" && outcome !== "retry") return false;
  return (
    contact !== null &&
    contact.isActive &&
    !contact.doNotContact &&
    contact.channelEmail &&
    contact.email !== null &&
    contact.email.trim() !== ""
  );
}

/**
 * Whether the sender should take this reminder today. One that was already
 * tried today waits for tomorrow's plan, whatever its status says: retries
 * are daily (spec §9) and the sender runs hourly. A reminder left `scheduled`
 * by a run that died after sending is the case the status alone would miss.
 */
export function dueToSend(attemptedAt: readonly string[], today: IsoDate): boolean {
  return !attemptedAt.some((at) => schedulerToday(new Date(at)) === today);
}

/**
 * The reminder's status after a send run.
 *
 * Any failed send leaves it `failed`, to be retried tomorrow for the
 * recipients that need it. With nobody left to send to, it is `sent` if
 * anybody ever received it and `cancelled` if nobody can.
 */
export function statusAfterSend(
  results: readonly { ok: boolean }[],
  previouslyReached: boolean,
): { status: "sent" | "failed" | "cancelled"; reason: string | null } {
  if (results.length === 0) {
    return previouslyReached
      ? { status: "sent", reason: null }
      : { status: "cancelled", reason: "Nobody on this reminder can be emailed" };
  }
  if (results.some((r) => !r.ok)) return { status: "failed", reason: null };
  return { status: "sent", reason: null };
}

/**
 * The Outbox overview (spec §10): counts over the rows the other sub-tabs
 * list, so the summary can never disagree with the detail under it.
 *
 * The delivery rate is over recipients whose outcome is known: delivered,
 * bounced, or failing. An address the provider accepted but has not yet
 * reported on is left out until it does — otherwise every fresh send reads
 * as a failure for the minutes before its delivery event arrives.
 */
export function outboxOverview(input: {
  today: IsoDate;
  reminders: readonly Pick<OutboxReminder, "status" | "scheduled_for" | "recipients">[];
  openAlerts: number;
}): Outbox["overview"] {
  const todays = input.reminders.filter((r) => r.scheduled_for === input.today);
  const sent = input.reminders.filter((r) => r.status === "sent");
  const attempted = sent.flatMap((r) => r.recipients).filter((x) => x.outcome !== "unsent");
  const delivered = attempted.filter((x) => x.outcome === "delivered").length;
  const known = attempted.filter((x) => x.outcome !== "accepted").length;
  const pending = attempted.length - known;

  return {
    queued_today: todays.filter((r) => r.status === "scheduled" || r.status === "failed").length,
    sent_today: todays.filter((r) => r.status === "sent").length,
    cancelled_today: todays.filter((r) => r.status === "cancelled").length,
    sent_week: sent.length,
    recipients_week: attempted.length,
    delivered_week: delivered,
    bounced_week: attempted.filter((x) => x.outcome === "hard_bounced").length,
    awaiting_week: pending,
    delivery_rate_pct: known === 0 ? null : Math.round((delivered / known) * 1000) / 10,
    open_alerts: input.openAlerts,
  };
}
