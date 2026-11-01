/**
 * Server side of `/api/v1/outbox` — the scheduler's work, as the user sees it.
 *
 * See docs/chasing-scheduler-spec.md §10. Reads go through the caller's
 * client, so RLS decides what exists; the per-recipient outcomes are the
 * scheduler's own (`loadReminders`), so a recipient this screen calls
 * delivered is one the planner will not retry.
 */

import { z } from "zod";

import { ApiError, resolveCaller, type Caller } from "@/lib/services/api.server";
import {
  CLAIM_LEASE_MINUTES,
  outboxOverview,
  schedulerToday,
  toCadenceTone,
} from "@/lib/services/chase-rules";
import {
  IN_CHUNK,
  loadReminders,
  type LoadedReminder,
} from "@/lib/services/chase-scheduler.server";
import { addDays } from "@/lib/services/dashboard-rules";
import type { Outbox, OutboxAlert, OutboxReminder } from "@/lib/schemas/outbox";
import { getAdminSupabase } from "@/lib/supabase/admin-client.server";

/** How far back the Sent tab and the week's numbers look. */
const SENT_DAYS = 7;

type Admin = Parameters<typeof loadReminders>[0];

/** `GET /api/v1/outbox` */
export async function buildOutbox(now: Date = new Date()): Promise<Outbox> {
  const caller = await resolveCaller();
  const today = schedulerToday(now);
  const weekStart = addDays(today, -(SENT_DAYS - 1));

  // Reminders are planned for the day they go, so a week of `scheduled_for`
  // covers both today's queue and every send since — a retry is moved to the
  // day it is retried.
  const loaded = await loadReminders(
    caller.supabase as unknown as Admin,
    { orgId: caller.orgId, scheduledFrom: weekStart },
    // Unlinked delivery events have no org, so RLS hides them; without this
    // the Outbox would say "Retrying" where the planner sees "Delivered".
    getAdminSupabase(),
  );
  const [names, alerts] = await Promise.all([loadNames(caller, loaded), loadAlerts(caller)]);

  const shaped = loaded.map((r) => shapeReminder(r, names, today, now));
  const todayQueue = shaped
    .filter((r) => r.scheduled_for === today)
    .sort((a, b) => a.step - b.step || a.invoice_number.localeCompare(b.invoice_number));
  const sent = shaped
    .filter((r) => r.status === "sent" && r.sent_at !== null)
    .sort((a, b) => (b.sent_at ?? "").localeCompare(a.sent_at ?? ""));

  return {
    today,
    overview: outboxOverview({ today, reminders: shaped, openAlerts: alerts.length }),
    today_queue: todayQueue,
    sent,
    alerts,
  };
}

/** Invoice numbers, account names and contact names for the loaded reminders. */
async function loadNames(caller: Caller, loaded: readonly LoadedReminder[]) {
  const invoiceIds = [...new Set(loaded.map((r) => r.row.invoice_id))];
  const contactIds = [
    ...new Set(loaded.flatMap((r) => r.row.reminder_recipients.map((x) => x.contact_id))),
  ];

  const [invoices, contacts] = await Promise.all([
    inChunks(invoiceIds, async (ids) => {
      const { data, error } = await caller.supabase
        .from("invoices")
        .select("id, invoice_number, account_id, accounts(name)")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    }),
    inChunks(contactIds, async (ids) => {
      const { data, error } = await caller.supabase
        .from("contacts")
        .select("id, name, email")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    }),
  ]);

  return {
    invoices: new Map(
      invoices.map((i) => [
        i.id,
        {
          number: i.invoice_number,
          accountId: i.account_id,
          accountName: (i.accounts as unknown as { name: string } | null)?.name ?? "",
        },
      ]),
    ),
    contacts: new Map(contacts.map((c) => [c.id, c])),
  };
}

/** `.in()` travels in the URL, so a long id list is read in slices and joined. */
async function inChunks<T>(
  ids: readonly string[],
  read: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK)
    rows.push(...(await read(ids.slice(i, i + IN_CHUNK))));
  return rows;
}

/** One reminder as the Outbox lists it. */
function shapeReminder(
  { row, facts }: LoadedReminder,
  names: Awaited<ReturnType<typeof loadNames>>,
  today: string,
  now: Date,
): OutboxReminder {
  const invoice = names.invoices.get(row.invoice_id);
  const leaseHeld =
    row.claimed_at !== null &&
    Date.parse(row.claimed_at) > now.getTime() - CLAIM_LEASE_MINUTES * 60_000;
  // Recipients are named by who the reminder was for; the address is the one
  // last tried, which is what a bounce reason refers to.
  const lastAddress = new Map<string, string>();
  for (const send of [...row.email_sends].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  )) {
    if (send.contact_id) lastAddress.set(send.contact_id, send.to_email);
  }

  return {
    id: row.id,
    invoice_id: row.invoice_id,
    invoice_number: invoice?.number ?? "",
    account_id: invoice?.accountId ?? "",
    account_name: invoice?.accountName ?? "",
    step: row.step,
    tone: toCadenceTone(row.tone),
    status: row.status,
    cancel_reason: row.cancel_reason,
    scheduled_for: row.scheduled_for,
    sent_at: row.sent_at,
    can_cancel:
      row.scheduled_for === today &&
      (row.status === "scheduled" || row.status === "failed") &&
      !leaseHeld,
    recipients: facts.recipients.map((r) => {
      const contact = names.contacts.get(r.contactId);
      return {
        contact_id: r.contactId,
        name: contact?.name ?? "Removed contact",
        email: lastAddress.get(r.contactId) ?? contact?.email ?? null,
        outcome: r.outcome,
        reason: r.reason,
      };
    }),
  };
}

/** The org's open alerts, newest first. */
async function loadAlerts(caller: Caller): Promise<OutboxAlert[]> {
  const { data, error } = await caller.supabase
    .from("chase_alerts")
    .select(
      "id, kind, account_id, contact_id, invoice_id, to_email, reason, created_at, " +
        "accounts(name), contacts(name)",
    )
    .eq("org_id", caller.orgId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  type Row = {
    id: string;
    kind: OutboxAlert["kind"];
    account_id: string;
    contact_id: string;
    to_email: string | null;
    reason: string;
    created_at: string;
    invoice_id: string | null;
    accounts: { name: string } | null;
    contacts: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // `invoice_id` carries no foreign key — the alert outlives a deleted
  // invoice — so PostgREST cannot embed it; the numbers are a second read.
  const invoiceIds = [...new Set(rows.flatMap((a) => (a.invoice_id ? [a.invoice_id] : [])))];
  const invoices = await inChunks(invoiceIds, async (ids) => {
    const { data: rows, error: readError } = await caller.supabase
      .from("invoices")
      .select("id, invoice_number")
      .in("id", ids);
    if (readError) throw readError;
    return rows ?? [];
  });
  const numbers = new Map(invoices.map((i) => [i.id, i.invoice_number]));

  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    account_id: a.account_id,
    account_name: a.accounts?.name ?? "",
    contact_id: a.contact_id,
    contact_name: a.contacts?.name ?? "Removed contact",
    to_email: a.to_email,
    invoice_number: a.invoice_id ? (numbers.get(a.invoice_id) ?? null) : null,
    reason: a.reason,
    created_at: a.created_at,
  }));
}

/** The number of open alerts, for the dashboard's attention strip. */
export async function countOpenAlerts(caller: Caller): Promise<number> {
  const { count, error } = await caller.supabase
    .from("chase_alerts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", caller.orgId)
    .is("resolved_at", null);
  if (error) throw error;
  return count ?? 0;
}

/** A path id that is not a uuid names nothing; answer as the RPC would for a missing row. */
function requireUuid(value: string | undefined, code: string, message: string): string {
  if (!value || !z.string().uuid().safeParse(value).success) throw new ApiError(404, code, message);
  return value;
}

/** `POST /api/v1/outbox/reminders/{id}/cancel` — false when it is already sending or settled. */
export async function cancelReminder(reminderId: string | undefined): Promise<boolean> {
  const id = requireUuid(reminderId, "reminder_not_found", "We couldn't find that reminder.");
  const caller = await resolveCaller();
  const { data, error } = await caller.supabase.rpc("chase_reminder_cancel", { p_reminder: id });
  if (error) throw error;
  return data === true;
}

/** `POST /api/v1/outbox/alerts/{id}/dismiss` */
export async function dismissAlert(alertId: string | undefined): Promise<void> {
  const id = requireUuid(alertId, "alert_not_found", "We couldn't find that alert.");
  const caller = await resolveCaller();
  const { error } = await caller.supabase.rpc("chase_alert_dismiss", { p_alert: id });
  if (error) throw error;
}
