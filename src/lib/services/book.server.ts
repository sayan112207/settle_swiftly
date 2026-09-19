/**
 * Loads the org's accounts, contacts and invoices and shapes them for the
 * rules modules. Shared by the dashboard and accounts APIs so both see the
 * same book, the same chase status, and the same exclusions:
 *
 * - archived accounts and their invoices are left out everywhere;
 * - only INR invoices count, because every figure is a single rupee amount;
 * - only invoices with money still owed become `BookInvoice`s.
 */

import {
  resolveChaseStatus,
  type AccountChaseFacts,
  type LadderContact,
  type PaidSample,
} from "@/lib/services/accounts-rules";
import { fetchAllPages, type Caller } from "@/lib/services/api.server";
import {
  todayInTimezone,
  toPaise,
  type BookInvoice,
  type IsoDate,
} from "@/lib/services/dashboard-rules";
import type {
  ChaseStatus,
  ContactLanguage,
  ContactTier,
  DeliveryState,
} from "@/lib/schemas/accounts";
import type { Database } from "@/lib/supabase/types.gen";

export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type InvoiceStatusValue = Database["public"]["Enums"]["invoice_status"];

/** An account with its active contacts and resolved chase status. */
export type AccountState = {
  row: AccountRow;
  contacts: ContactRow[];
  ladder: LadderContact[];
  chase: AccountChaseFacts;
  status: ChaseStatus;
};

/** The chase facts the rules need from an account row. */
export function chaseFacts(row: AccountRow): AccountChaseFacts {
  return {
    pausedAt: row.paused_at,
    pausedUntil: row.paused_until,
    chaseMode: row.chase_mode as AccountChaseFacts["chaseMode"],
  };
}

/** A contact row in the shape the rules read. */
export function ladderContact(row: ContactRow): LadderContact {
  return {
    tier: row.priority as ContactTier,
    name: row.name,
    doNotContact: row.do_not_contact,
    deliveryState: row.delivery_state as DeliveryState,
    designation: row.designation,
    channelEmail: row.channel_email,
    channelWhatsapp: row.channel_whatsapp,
    channelSms: row.channel_sms,
    sortOrder: row.sort_order,
  };
}

/** Narrows a stored language code to the wire enum, defaulting to English. */
export function contactLanguage(value: string): ContactLanguage {
  const known: readonly string[] = ["en", "hi", "ta", "te", "mr", "gu", "bn", "kn"];
  return (known.includes(value) ? value : "en") as ContactLanguage;
}

/** Which accounts to load: the live book (default), the Archived tab, or both. */
export type ArchivedScope = "exclude" | "only" | "include";

/**
 * The org's accounts (or just `accountId`), with active contacts and chase
 * status, keyed by id. Archived accounts are excluded unless asked for: they
 * stay readable under Accounts → Archived but are out of totals and chasing.
 */
export async function loadAccounts(
  caller: Caller,
  today: IsoDate,
  options: { accountId?: string; archived?: ArchivedScope } = {},
): Promise<Map<string, AccountState>> {
  const { supabase, orgId } = caller;
  const { accountId, archived = "exclude" } = options;

  const [accounts, contacts] = await Promise.all([
    fetchAllPages((from, to) => {
      let query = supabase.from("accounts").select("*").eq("org_id", orgId);
      if (archived === "exclude") query = query.is("archived_at", null);
      if (archived === "only") query = query.not("archived_at", "is", null);
      if (accountId) query = query.eq("id", accountId);
      return query.order("id").range(from, to);
    }),
    fetchAllPages((from, to) => {
      let query = supabase.from("contacts").select("*").eq("org_id", orgId).eq("is_active", true);
      if (accountId) query = query.eq("account_id", accountId);
      return query
        .order("priority")
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to);
    }),
  ]);

  const byAccount = new Map<string, ContactRow[]>();
  for (const contact of contacts) {
    const list = byAccount.get(contact.account_id) ?? [];
    list.push(contact);
    byAccount.set(contact.account_id, list);
  }

  const states = new Map<string, AccountState>();
  for (const row of accounts) {
    const own = byAccount.get(row.id) ?? [];
    const ladder = own.map(ladderContact);
    const chase = chaseFacts(row);
    states.set(row.id, {
      row,
      contacts: own,
      ladder,
      chase,
      status: resolveChaseStatus(chase, ladder, today),
    });
  }
  return states;
}

/** The invoice columns the book needs, with payments and sent reminders. */
type InvoiceRow = {
  id: string;
  account_id: string;
  invoice_number: string;
  amount: number;
  issue_date: string;
  due_date: string;
  status: string;
  disputed_at: string | null;
  promised_date: string | null;
  promised_at: string | null;
  promise_broken_count: number;
  last_promise_broken_at: string | null;
  payments: Array<{ amount: number; paid_on: string }>;
  reminders: Array<{ status: string; sent_at: string | null }>;
};

/** An open invoice plus the raw fields the Invoices tab shows. */
export type BookEntry = { invoice: BookInvoice; issueDate: IsoDate; grossPaise: number };

/**
 * The open book for the org (or one account), and each account's paid-invoice
 * lateness samples for `avg_days_late`.
 *
 * `includePaid` also loads `paid` invoices: needed for payment history, not for
 * exposure, so the dashboard skips it.
 */
export async function loadBook(
  caller: Caller,
  today: IsoDate,
  accounts: Map<string, AccountState>,
  options: { accountId?: string; includePaid?: boolean } = {},
): Promise<{ entries: BookEntry[]; paidSamples: Map<string, PaidSample[]> }> {
  const { supabase, orgId, timezone } = caller;
  const statuses: InvoiceStatusValue[] = options.includePaid
    ? ["open", "partially_paid", "paid"]
    : ["open", "partially_paid"];

  const rows = (await fetchAllPages((from, to) => {
    let query = supabase
      .from("invoices")
      .select(
        "id, account_id, invoice_number, amount, issue_date, due_date, status, disputed_at, " +
          "promised_date, promised_at, promise_broken_count, last_promise_broken_at, " +
          "payments(amount, paid_on), reminders(status, sent_at)",
      )
      .eq("org_id", orgId)
      .eq("currency", "INR")
      .in("status", statuses);
    if (options.accountId) query = query.eq("account_id", options.accountId);
    return query.order("id").range(from, to);
  })) as unknown as InvoiceRow[];

  const entries: BookEntry[] = [];
  const paidSamples = new Map<string, PaidSample[]>();

  for (const row of rows) {
    const account = accounts.get(row.account_id);
    if (!account) continue; // archived, or not in scope

    const grossPaise = toPaise(row.amount);
    const paidPaise = row.payments.reduce((sum, p) => sum + toPaise(p.amount), 0);
    const outstandingPaise = grossPaise - paidPaise;

    if (outstandingPaise <= 0) {
      // Settled: the day the last payment landed is its paid_on.
      const paidOn = row.payments.reduce<string | null>(
        (latest, p) => (latest === null || p.paid_on > latest ? p.paid_on : latest),
        null,
      );
      if (paidOn !== null) {
        const list = paidSamples.get(row.account_id) ?? [];
        list.push({ dueDate: row.due_date, paidOn });
        paidSamples.set(row.account_id, list);
      }
      continue;
    }

    const sent = row.reminders.filter((r) => r.status === "sent" && r.sent_at !== null);
    const lastSentAt = sent.reduce<string | null>(
      (latest, r) => (latest === null || (r.sent_at ?? "") > latest ? r.sent_at : latest),
      null,
    );

    entries.push({
      issueDate: row.issue_date,
      grossPaise,
      invoice: {
        id: row.id,
        accountId: row.account_id,
        accountName: account.row.name,
        invoiceNumber: row.invoice_number,
        dueDate: row.due_date,
        outstandingPaise,
        partiallyPaid: paidPaise > 0,
        disputed: row.disputed_at !== null,
        promisedDate: row.promised_date,
        promisedAt: row.promised_at,
        promiseBrokenCount: row.promise_broken_count,
        lastPromiseBrokenAt: row.last_promise_broken_at,
        reminderCount: sent.length,
        lastReminderOn:
          lastSentAt === null ? null : todayInTimezone(timezone, new Date(lastSentAt)),
        accountPaused: account.status === "paused",
        accountHasUsableP0: account.status !== "no_p0" && account.status !== "bounced_p0",
      },
    });
  }

  return { entries, paidSamples };
}

/**
 * Records any promise whose pause ran out since the last look. Idempotent, so
 * running it on every read stands in for the nightly job the contract
 * describes — each promise is still counted exactly once.
 */
export async function reconcileBrokenPromises(caller: Caller): Promise<void> {
  const { error } = await caller.supabase.rpc("reconcile_broken_promises", {
    p_org: caller.orgId,
  });
  if (error) throw error;
}
