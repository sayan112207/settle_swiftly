/**
 * The chasing scheduler: plan at 08:00 IST, send from 09:00 IST.
 *
 * See docs/chasing-scheduler-spec.md §8. Two entry points, each woken by its
 * own cron job, and the hour between them belongs to the user — the plan is a
 * queue they can read (and, from the Outbox, cancel) before anything goes.
 *
 * Every decision is made in `chase-rules.ts`; this module only loads facts
 * and carries out what the rules return. It runs as the service role because
 * nobody is signed in, and tenancy holds because every read below is scoped
 * by `org_id` explicitly — the same loaders the dashboard uses, given a
 * system caller instead of a user's.
 */

import { z } from "zod";

import { mergeSteps, defaultSteps, resolveSendWindow } from "@/lib/services/accounts-rules";
import type { Caller } from "@/lib/services/api.server";
import { fetchAllPages } from "@/lib/services/api.server";
import {
  contactLanguage,
  loadAccounts,
  loadBook,
  type AccountState,
  type BookEntry,
} from "@/lib/services/book.server";
import {
  CLAIM_LEASE_MINUTES,
  QUOTA_RESERVE,
  SCHEDULER_TIMEZONE,
  UNKNOWN_OUTCOME_MATCH_MINUTES,
  holdReason,
  isWindowDay,
  isWindowOpen,
  dueToSend,
  needsSend,
  planInvoice,
  recipientOutcome,
  schedulerToday,
  statusAfterSend,
  toCadenceTone,
  toReminderTone,
  type PlanAction,
  type ReminderFacts,
  type ReminderStatus,
  type ReminderTone,
  type SendAttempt,
} from "@/lib/services/chase-rules";
import {
  daysOverdue,
  paiseToMoney,
  todayInTimezone,
  type IsoDate,
} from "@/lib/services/dashboard-rules";
import { classifyEvent } from "@/lib/services/email-rules";
import { sendReminder } from "@/lib/services/reminder-send.server";
import { emailQuotaRemaining } from "@/lib/services/smtp2go.server";
import type { CadenceChannel, CadenceRecipients, CadenceTone } from "@/lib/schemas/accounts";
import { getAdminSupabase } from "@/lib/supabase/admin-client.server";

type Admin = ReturnType<typeof getAdminSupabase>;

/** `.in()` travels in the URL; keep each list well under any proxy's limit. */
export const IN_CHUNK = 100;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** A system caller for one org: the shared loaders, scoped by `org_id`, with no user. */
function systemCaller(supabase: Admin, orgId: string): Caller {
  return {
    supabase: supabase as unknown as Caller["supabase"],
    orgId,
    userId: "",
    timezone: SCHEDULER_TIMEZONE,
  };
}

/** One org's accounts and open book, as the rules see them. */
async function loadOrg(supabase: Admin, orgId: string, today: IsoDate) {
  const caller = systemCaller(supabase, orgId);
  const accounts = await loadAccounts(caller, today);
  const { entries } = await loadBook(caller, today, accounts);
  return { accounts, book: new Map(entries.map((e) => [e.invoice.id, e])) };
}

const REMINDER_COLUMNS =
  "id, org_id, invoice_id, step, status, tone, created_at, scheduled_for, sent_at, " +
  "cancel_reason, claimed_at, " +
  "reminder_recipients(contact_id), " +
  "email_sends(contact_id, status, created_at, error, to_email, email_callbacks(event, occurred_at))";

type ReminderRow = {
  id: string;
  org_id: string;
  invoice_id: string;
  step: number;
  status: ReminderStatus;
  tone: ReminderTone;
  created_at: string;
  scheduled_for: IsoDate;
  sent_at: string | null;
  cancel_reason: string | null;
  claimed_at: string | null;
  reminder_recipients: { contact_id: string }[];
  email_sends: {
    contact_id: string | null;
    status: SendAttempt["status"];
    created_at: string;
    error: string | null;
    to_email: string;
    email_callbacks: { event: string; occurred_at: string | null }[];
  }[];
};

/** A reminder row with its derived facts. */
export type LoadedReminder = { row: ReminderRow; facts: ReminderFacts };

/** Which reminders to load: an invoice's history, today's queue, or an org's recent days. */
type ReminderScope =
  | { invoiceIds: readonly string[] }
  | { queuedOn: IsoDate }
  | { orgId: string; scheduledFrom: IsoDate };

/**
 * Reminders matching `filter`, each with every recipient's derived outcome.
 *
 * A send that failed gets one more look (spec §9): an event to the same
 * address within a few minutes of it, which the link step could not attach
 * because a send that threw never got a provider id. Without this, a timeout
 * that did land would be retried, and the customer chased twice.
 *
 * Unlinked events belong to no org, so RLS hides them from a user's client.
 * A caller reading as a user passes the admin client as `events`; the read
 * stays limited to the addresses of the failed sends it already loaded.
 */
export async function loadReminders(
  supabase: Admin,
  scope: ReminderScope,
  events: Admin = supabase,
): Promise<LoadedReminder[]> {
  const rows = (await fetchAllPages((from, to) => {
    const query = supabase.from("reminders").select(REMINDER_COLUMNS);
    const scoped =
      "invoiceIds" in scope
        ? query.in("invoice_id", [...scope.invoiceIds])
        : "queuedOn" in scope
          ? query.eq("scheduled_for", scope.queuedOn).in("status", ["scheduled", "failed"])
          : query.eq("org_id", scope.orgId).gte("scheduled_for", scope.scheduledFrom);
    return scoped.order("id").range(from, to);
  })) as unknown as ReminderRow[];

  const failed = rows.flatMap((r) => r.email_sends.filter((s) => s.status === "failed"));
  const unlinked = await unlinkedEventsNear(events, failed);

  return rows.map((row) => ({
    row,
    facts: {
      id: row.id,
      step: row.step,
      status: row.status,
      plannedOn: todayInTimezone(SCHEDULER_TIMEZONE, new Date(row.created_at)),
      recipients: row.reminder_recipients.map(({ contact_id }) => {
        const attempts: SendAttempt[] = row.email_sends
          .filter((s) => s.contact_id === contact_id)
          .map((s) => ({
            status: s.status,
            createdAt: s.created_at,
            error: s.error,
            events: [
              ...s.email_callbacks,
              ...(s.status === "failed" ? matchUnlinked(unlinked, s) : []),
            ]
              .filter((e): e is { event: string; occurred_at: string } => e.occurred_at !== null)
              .map((e) => ({ outcome: classifyEvent(e.event), occurredAt: e.occurred_at })),
          }));
        return { contactId: contact_id, ...recipientOutcome(attempts) };
      }),
    },
  }));
}

type UnlinkedEvent = { event: string; occurred_at: string | null; to_email: string | null };

/** Events no send claimed, to the addresses of failed sends, since the earliest of them. */
async function unlinkedEventsNear(
  supabase: Admin,
  failed: readonly { to_email: string; created_at: string }[],
): Promise<UnlinkedEvent[]> {
  if (failed.length === 0) return [];
  const since = failed.reduce(
    (min, s) => (s.created_at < min ? s.created_at : min),
    failed[0]?.created_at ?? "",
  );
  const addresses = [...new Set(failed.flatMap((s) => [s.to_email, s.to_email.toLowerCase()]))];

  const events: UnlinkedEvent[] = [];
  for (let i = 0; i < addresses.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("email_callbacks")
      .select("event, occurred_at, to_email")
      .is("send_id", null)
      .gte("occurred_at", since)
      .in("to_email", addresses.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`Reading unlinked delivery events failed: ${error.message}`);
    events.push(...(data ?? []));
  }
  return events;
}

/** The unlinked events that plausibly belong to this failed send. */
function matchUnlinked(
  events: readonly UnlinkedEvent[],
  send: { to_email: string; created_at: string },
): UnlinkedEvent[] {
  const start = Date.parse(send.created_at);
  const end = start + UNKNOWN_OUTCOME_MATCH_MINUTES * 60_000;
  const address = send.to_email.toLowerCase();
  return events.filter((e) => {
    if (e.occurred_at === null || e.to_email?.toLowerCase() !== address) return false;
    const at = Date.parse(e.occurred_at);
    return at >= start && at <= end;
  });
}

/** The org's stored cadence overrides, by account. */
async function loadOverrides(supabase: Admin, orgId: string) {
  const { data, error } = await supabase
    .from("account_cadence_steps")
    .select("account_id, step_key, tone, channel, recipients")
    .eq("org_id", orgId);
  if (error) throw new Error(`Reading cadence overrides failed: ${error.message}`);

  const byAccount = new Map<string, Parameters<typeof mergeSteps>[0][number][]>();
  for (const o of data ?? []) {
    const list = byAccount.get(o.account_id) ?? [];
    list.push({
      key: o.step_key,
      tone: o.tone as CadenceTone,
      channel: o.channel as CadenceChannel,
      recipients: o.recipients as CadenceRecipients,
    });
    byAccount.set(o.account_id, list);
  }
  return byAccount;
}

/** The account's send window, from its row. */
function windowOf(account: AccountState) {
  return resolveSendWindow({
    mode: account.row.send_window_mode,
    opens: account.row.send_window_opens,
    closes: account.row.send_window_closes,
    days: account.row.send_window_days,
  });
}

/** Every org, with the name its reminders are sent under. */
async function loadOrgs(supabase: Admin): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("orgs").select("id, name").order("id");
  if (error) throw new Error(`Reading orgs failed: ${error.message}`);
  return data ?? [];
}

/** Records a reminder's outcome, releases its claim, and logs a send. */
async function settle(
  supabase: Admin,
  reminderId: string,
  status: "sent" | "failed" | "cancelled",
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("chase_reminder_settle", {
    p_reminder: reminderId,
    p_status: status,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) throw new Error(`Settling reminder ${reminderId} failed: ${error.message}`);
}

/**
 * Narrows a run to some accounts, for running a first plan and send by hand
 * on one customer (README → Turning on the chase jobs). The cron jobs never
 * pass one: omitted, a run covers every account.
 */
export type RunScope = { accountIds?: readonly string[] };

/** The request body the internal endpoints accept: `{}` from cron, or a list of accounts. */
export const runScopeSchema = z
  .object({ account_ids: z.array(z.string().uuid()).min(1).optional() })
  .transform((body): RunScope => (body.account_ids ? { accountIds: body.account_ids } : {}));

/** Whether a run with this scope covers the account. */
function inScope(scope: RunScope, accountId: string): boolean {
  return !scope.accountIds || scope.accountIds.includes(accountId);
}

// ---------------------------------------------------------------------------
// Plan — 08:00 IST
// ---------------------------------------------------------------------------

export type PlanResult = {
  today: IsoDate;
  invoices: number;
  scheduled: number;
  retried: number;
  cancelled: number;
  gaveUp: number;
  alertsRaised: number;
  skipped: { invoiceId: string; step: string; reason: string }[];
  errors: string[];
};

/**
 * Writes today's queue. Sends nothing.
 *
 * Safe to run twice: a new step is an insert the unique index refuses the
 * second time, and a retry only moves a row's date to today. One invoice
 * failing is recorded and the rest carry on — a bad row must not cost every
 * other customer their reminder.
 */
export async function planChases(
  now: Date = new Date(),
  scope: RunScope = {},
): Promise<PlanResult> {
  const supabase = getAdminSupabase();
  const today = schedulerToday(now);
  const result: PlanResult = {
    today,
    invoices: 0,
    scheduled: 0,
    retried: 0,
    cancelled: 0,
    gaveUp: 0,
    alertsRaised: 0,
    skipped: [],
    errors: [],
  };

  for (const org of await loadOrgs(supabase)) {
    try {
      await planOrg(supabase, org.id, today, scope, result);
    } catch (error) {
      // One org that cannot be read must not cost every org after it its plan.
      result.errors.push(
        `org ${org.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

/** One org's plan: retries first, then each invoice's next step. */
async function planOrg(
  supabase: Admin,
  orgId: string,
  today: IsoDate,
  scope: RunScope,
  result: PlanResult,
): Promise<void> {
  const { accounts, book } = await loadOrg(supabase, orgId, today);
  const overrides = await loadOverrides(supabase, orgId);

  const ids = [...book.keys()];
  const reminders = new Map<string, ReminderFacts[]>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    for (const { row, facts } of await loadReminders(supabase, { invoiceIds: chunk })) {
      reminders.set(row.invoice_id, [...(reminders.get(row.invoice_id) ?? []), facts]);
    }
  }

  await cancelOrphans(supabase, orgId, book, result);

  for (const entry of book.values()) {
    if (!inScope(scope, entry.invoice.accountId)) continue;
    const account = accounts.get(entry.invoice.accountId);
    if (!account) continue;
    result.invoices += 1;

    const actions = planInvoice({
      today,
      daysSinceAnchor: daysOverdue(entry.invoice, today),
      steps:
        account.row.chase_mode === "custom"
          ? mergeSteps(overrides.get(account.row.id) ?? [])
          : defaultSteps(),
      hold: holdReason(account.status, entry.invoice, today),
      windowDay: isWindowDay(windowOf(account), today),
      reminders: reminders.get(entry.invoice.id) ?? [],
    });

    try {
      for (const action of actions) await apply(supabase, entry, action, today, result);
    } catch (error) {
      result.errors.push(
        `${entry.invoice.invoiceNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Carries out one planner action. */
async function apply(
  supabase: Admin,
  entry: BookEntry,
  action: PlanAction,
  today: IsoDate,
  result: PlanResult,
): Promise<void> {
  switch (action.type) {
    case "cancel":
      await settle(supabase, action.reminderId, "cancelled", action.reason);
      result.cancelled += 1;
      return;

    case "give_up": {
      await settle(supabase, action.reminderId, action.status, action.reason);
      result.gaveUp += 1;
      for (const failing of action.failing) {
        const { data, error } = await supabase.rpc("chase_alert_raise", {
          p_contact: failing.contactId,
          p_kind: "undelivered",
          p_reason: failing.reason,
          p_reminder: action.reminderId,
        });
        if (error) throw new Error(`Raising an alert failed: ${error.message}`);
        if (data) result.alertsRaised += 1;
      }
      return;
    }

    case "retry": {
      const { error } = await supabase
        .from("reminders")
        .update({ status: action.status, scheduled_for: today })
        .eq("id", action.reminderId);
      if (error) throw new Error(`Re-queuing a retry failed: ${error.message}`);
      result.retried += 1;
      return;
    }

    case "schedule": {
      const { error } = await supabase.rpc("schedule_reminder", {
        p_invoice_id: entry.invoice.id,
        p_step: action.stepNumber,
        p_channel: "email",
        p_tone: toReminderTone(action.tone),
        p_recipients: action.recipients,
        p_scheduled_for: today,
      });
      // Another run got there first. The index did its job; nothing to do.
      if (error?.message === "step_already_scheduled") return;
      if (error) throw new Error(`Scheduling ${action.stepKey} failed: ${error.message}`);
      result.scheduled += 1;
      return;
    }

    case "skip":
      result.skipped.push({
        invoiceId: entry.invoice.id,
        step: action.stepKey,
        reason: action.reason,
      });
      return;
  }
}

/**
 * Open reminders on invoices that have left the book — paid, voided, or on an
 * archived account. Nothing would ever look at them again, so they close here
 * with the reason.
 */
async function cancelOrphans(
  supabase: Admin,
  orgId: string,
  book: Map<string, BookEntry>,
  result: PlanResult,
): Promise<void> {
  const { data, error } = await supabase
    .from("reminders")
    .select("id, invoice_id")
    .eq("org_id", orgId)
    .in("status", ["scheduled", "failed"]);
  if (error) throw new Error(`Reading open reminders failed: ${error.message}`);

  for (const row of data ?? []) {
    if (book.has(row.invoice_id)) continue;
    await settle(supabase, row.id, "cancelled", "The invoice is no longer open");
    result.cancelled += 1;
  }
}

// ---------------------------------------------------------------------------
// Send — hourly, 09:00 to 19:00 IST
// ---------------------------------------------------------------------------

export type SendResult = {
  today: IsoDate;
  queued: number;
  emailsSent: number;
  emailsFailed: number;
  reminders: { sent: number; failed: number; cancelled: number };
  /** Held, or outside its window this hour — still queued for a later run. */
  waiting: number;
  /** Set when the run stopped early because the quota would not cover the next reminder. */
  stoppedForQuota: string | null;
  errors: string[];
};

/**
 * Sends today's queue, as far as each account's window and the quota allow.
 *
 * Re-checks the gates first: the plan is an hour old, and an account paused
 * at 8:30 must not be mailed at 9. A reminder goes to all of its outstanding
 * recipients or none of them — the quota is checked per reminder, not per
 * email, because half a conversation is worse than none (spec §7).
 */
export async function sendChases(
  now: Date = new Date(),
  scope: RunScope = {},
): Promise<SendResult> {
  const supabase = getAdminSupabase();
  const today = schedulerToday(now);
  const result: SendResult = {
    today,
    queued: 0,
    emailsSent: 0,
    emailsFailed: 0,
    reminders: { sent: 0, failed: 0, cancelled: 0 },
    waiting: 0,
    stoppedForQuota: null,
    errors: [],
  };

  const queue = await loadReminders(supabase, { queuedOn: today });
  result.queued = queue.length;
  // Nine of the eleven hourly runs find nothing. Don't spend a provider call
  // on the quota to learn that.
  if (queue.length === 0) return result;

  let remaining = (await emailQuotaRemaining()) - QUOTA_RESERVE;

  const orgs = new Map((await loadOrgs(supabase)).map((o) => [o.id, o.name]));
  const loaded = new Map<string, Awaited<ReturnType<typeof loadOrg>>>();

  // Lower steps first: an older conversation is the one most worth finishing
  // if the quota runs short.
  queue.sort((a, b) => a.row.step - b.row.step);

  for (const { row, facts } of queue) {
    try {
      let org = loaded.get(row.org_id);
      if (!org) {
        org = await loadOrg(supabase, row.org_id, today);
        loaded.set(row.org_id, org);
      }

      const entry = org.book.get(row.invoice_id);
      if (scope.accountIds && (!entry || !inScope(scope, entry.invoice.accountId))) continue;
      if (!entry) {
        await settle(supabase, row.id, "cancelled", "The invoice is no longer open");
        result.reminders.cancelled += 1;
        continue;
      }
      const account = org.accounts.get(entry.invoice.accountId);
      if (
        !account ||
        holdReason(account.status, entry.invoice, today) !== null ||
        !isWindowOpen(windowOf(account), now)
      ) {
        result.waiting += 1;
        continue;
      }

      if (
        !dueToSend(
          row.status,
          row.email_sends.map((send) => send.created_at),
          today,
        )
      ) {
        result.waiting += 1;
        continue;
      }

      const contacts = new Map(account.contacts.map((c) => [c.id, c]));
      const targetsOf = (current: ReminderFacts) =>
        current.recipients.filter((r) => {
          const c = contacts.get(r.contactId);
          return needsSend(
            r.outcome,
            c
              ? {
                  isActive: c.is_active,
                  doNotContact: c.do_not_contact,
                  email: c.email,
                  channelEmail: c.channel_email,
                }
              : null,
          );
        });

      if (targetsOf(facts).length > remaining) {
        result.stoppedForQuota =
          `Stopped with ${Math.max(remaining, 0)} emails left this cycle (keeping ` +
          `${QUOTA_RESERVE} for sign-up mail); the rest of today's queue waits.`;
        break;
      }

      if (!(await claim(supabase, row.id, now))) continue;

      // Recipients are chosen again now that the row is ours. The queue was
      // read before the loop, and a run that overlapped this one may have
      // settled the reminder `failed` since — having reached some of the
      // people on it, who must not hear it twice.
      const fresh =
        (await loadReminders(supabase, { invoiceIds: [row.invoice_id] })).find(
          (r) => r.row.id === row.id,
        )?.facts ?? facts;
      const targets = targetsOf(fresh);

      const sends: { ok: boolean }[] = [];
      for (const target of targets) {
        const contact = contacts.get(target.contactId);
        if (!contact?.email) continue;
        try {
          const sent = await sendReminder({
            orgId: row.org_id,
            reminderId: row.id,
            contactId: contact.id,
            toEmail: contact.email,
            context: {
              orgName: orgs.get(row.org_id) ?? "",
              contactName: contact.name,
              accountName: account.row.name,
              invoiceNumber: entry.invoice.invoiceNumber,
              amount: paiseToMoney(entry.invoice.outstandingPaise),
              dueDate: entry.invoice.dueDate,
              daysOverdue: daysOverdue(entry.invoice, today),
              tone: toCadenceTone(row.tone),
              language: contactLanguage(contact.language),
            },
          });
          sends.push({ ok: sent.ok });
        } catch (error) {
          // Could not even record the send. Treated as a failure to retry
          // tomorrow; the claim is released below either way.
          sends.push({ ok: false });
          result.errors.push(`${entry.invoice.invoiceNumber}: ${String(error)}`);
        }
      }
      remaining -= sends.length;
      result.emailsSent += sends.filter((s) => s.ok).length;
      result.emailsFailed += sends.filter((s) => !s.ok).length;

      const reached = fresh.recipients.some(
        (r) => r.outcome === "delivered" || r.outcome === "accepted",
      );
      const next = statusAfterSend(sends, reached);
      await settle(supabase, row.id, next.status, next.reason);
      result.reminders[next.status] += 1;
    } catch (error) {
      result.errors.push(
        `reminder ${row.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

/**
 * Takes the row for this run (spec §6). False means another run holds it —
 * skip it and say nothing. An expired lease is fair game: its run died.
 */
async function claim(supabase: Admin, reminderId: string, now: Date): Promise<boolean> {
  const expired = new Date(now.getTime() - CLAIM_LEASE_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from("reminders")
    .update({ claimed_at: now.toISOString() })
    .eq("id", reminderId)
    .in("status", ["scheduled", "failed"])
    .or(`claimed_at.is.null,claimed_at.lt.${expired}`)
    .select("id");
  if (error) throw new Error(`Claiming reminder ${reminderId} failed: ${error.message}`);
  return (data ?? []).length > 0;
}
