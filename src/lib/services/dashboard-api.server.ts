/**
 * Server side of `GET /api/v1/dashboard/*` and `POST /api/v1/chases`.
 *
 * Loading is shared with the accounts API (`book.server.ts`), and the rules
 * live in `dashboard-rules.ts` / `accounts-rules.ts`. This module only shapes
 * responses — so a scoring change never needs a database to test.
 */

import { z } from "zod";

import type {
  AgingBucket,
  ChaseQueue,
  ChaseResponse,
  DashboardSummary,
} from "@/lib/schemas/dashboard";
import {
  addDays,
  agingTotals,
  daysOverdue,
  eligibleInvoices,
  ineligibleReason,
  paiseToMoney,
  scoreQueue,
  sharePct,
  todayInTimezone,
  type BookInvoice,
  type IsoDate,
} from "@/lib/services/dashboard-rules";
import { resolveCaller, type Caller } from "@/lib/services/api.server";
import { loadAccounts, loadBook, reconcileBrokenPromises } from "@/lib/services/book.server";

/** Reconciles broken promises, then loads the org's open book as of today in the org timezone. */
async function loadCurrentBook(): Promise<{ caller: Caller; today: IsoDate; book: BookInvoice[] }> {
  const caller = await resolveCaller();
  await reconcileBrokenPromises(caller);
  const today = todayInTimezone(caller.timezone);
  const accounts = await loadAccounts(caller, today);
  const { entries } = await loadBook(caller, today, accounts);
  return { caller, today, book: entries.map((entry) => entry.invoice) };
}

/** `GET /api/v1/dashboard/summary` */
export async function buildSummary(): Promise<DashboardSummary> {
  const { today, book } = await loadCurrentBook();

  const totalPaise = book.reduce((sum, invoice) => sum + invoice.outstandingPaise, 0);
  const overduePaise = book
    .filter((invoice) => daysOverdue(invoice, today) > 0)
    .reduce((sum, invoice) => sum + invoice.outstandingPaise, 0);

  const owingAccounts = new Map<string, boolean>();
  for (const invoice of book) owingAccounts.set(invoice.accountId, invoice.accountHasUsableP0);
  const accountsWithoutP0 = [...owingAccounts.values()].filter((hasP0) => !hasP0).length;

  const weekStart = addDays(today, -6);
  const bucketPaise = new Map(agingTotals(book, today).map(({ bucket, paise }) => [bucket, paise]));
  const segment = <B extends AgingBucket>(bucket: B) => {
    const paise = bucketPaise.get(bucket) ?? 0;
    return { bucket, amount: paiseToMoney(paise), share_pct: sharePct(paise, totalPaise) };
  };

  return {
    as_of: new Date().toISOString(),
    // Priority is computed on every request, so it can never be behind.
    stale: false,
    tiles: {
      total_outstanding: paiseToMoney(totalPaise),
      account_count: owingAccounts.size,
      overdue: paiseToMoney(overduePaise),
      overdue_share_pct: sharePct(overduePaise, totalPaise),
      open_invoice_count: book.length,
      missing_contact_account_count: accountsWithoutP0,
    },
    aging: [
      segment("Not yet due"),
      segment("1–30"),
      segment("31–60"),
      segment("61–90"),
      segment("90+"),
    ],
    attention: {
      accounts_without_p0: accountsWithoutP0,
      disputes_open: book.filter((invoice) => invoice.disputed).length,
      promises_broken_this_week: book.filter(
        (invoice) =>
          invoice.lastPromiseBrokenAt !== null &&
          invoice.lastPromiseBrokenAt >= weekStart &&
          invoice.lastPromiseBrokenAt <= today,
      ).length,
    },
  };
}

/** Contract: `limit` defaults to 6, max 50. */
export const chaseQueueLimitSchema = z.coerce.number().int().min(1).max(50).default(6);

/** `GET /api/v1/dashboard/chase-queue?limit=` */
export async function buildChaseQueue(limit: number): Promise<ChaseQueue> {
  const { today, book } = await loadCurrentBook();
  const ranked = scoreQueue(eligibleInvoices(book, today), today);

  return {
    total_eligible: ranked.length,
    items: ranked.slice(0, limit).map((entry) => ({
      invoice_id: entry.invoice.id,
      account_id: entry.invoice.accountId,
      account_name: entry.invoice.accountName,
      invoice_number: entry.invoice.invoiceNumber,
      amount_outstanding: paiseToMoney(entry.invoice.outstandingPaise),
      days_overdue: entry.daysOverdue,
      priority_band: entry.band,
      priority_reason: entry.reason,
    })),
  };
}

/** `POST /api/v1/chases` request body. */
export const chaseRequestBodySchema = z.object({
  invoice_ids: z.array(z.string().uuid()).min(1).max(200),
});

/**
 * `POST /api/v1/chases` — re-checks every invoice against the current book,
 * since the page that sent the list may be minutes old, then appends one
 * `chase_requests` row per invoice that still qualifies.
 *
 * All accepted rows go in one insert, which PostgREST runs as one transaction:
 * either the whole accepted set is recorded or none of it is.
 */
export async function requestChases(invoiceIds: readonly string[]): Promise<ChaseResponse> {
  const { caller, today, book } = await loadCurrentBook();
  const byId = new Map(book.map((invoice) => [invoice.id, invoice]));

  const accepted: string[] = [];
  const skipped: ChaseResponse["skipped"] = [];

  for (const invoiceId of new Set(invoiceIds)) {
    const invoice = byId.get(invoiceId);
    // Not in the open book: paid, written off, in another org, or never existed.
    // The same answer for all of them, so the response cannot probe other tenants.
    if (!invoice) {
      skipped.push({ invoice_id: invoiceId, reason: "Nothing left to collect" });
      continue;
    }
    const reason = ineligibleReason(invoice, today);
    if (reason) skipped.push({ invoice_id: invoiceId, reason });
    else accepted.push(invoiceId);
  }

  if (accepted.length > 0) {
    const { error } = await caller.supabase.from("chase_requests").insert(
      accepted.map((invoiceId) => ({
        org_id: caller.orgId,
        invoice_id: invoiceId,
        requested_by: caller.userId,
      })),
    );
    if (error) throw error;
  }

  return { queued: accepted.length, skipped };
}
