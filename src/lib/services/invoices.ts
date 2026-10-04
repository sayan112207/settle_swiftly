import { createServerFn } from "@tanstack/react-start";

import { importInvoicesSchema } from "@/lib/schemas/invoices";
import { getUserSupabase } from "@/lib/supabase/user-client.server";

export const invoicesQueryKeys = {
  list: (orgId: string) => ["invoices", "list", orgId] as const,
};

export type InvoiceImportResult =
  { ok: true; created: number } | { ok: false; message: string; code?: string };

/**
 * Inserts through the caller-bound Supabase client. RLS verifies both tenant
 * membership and account ownership; this service deliberately does not try to
 * reproduce either rule in the browser.
 */
export const importInvoices = createServerFn({ method: "POST" })
  .validator(importInvoicesSchema)
  .handler(async ({ data }): Promise<InvoiceImportResult> => {
    const supabase = getUserSupabase();
    const { data: inserted, error } = await supabase
      .from("invoices")
      .insert(
        data.invoices.map((invoice) => ({
          org_id: data.org_id,
          account_id: invoice.account_id,
          invoice_number: invoice.invoice_number,
          // invoiceDraftSchema's decimalMoneySchema guarantees this is
          // digits with at most two decimal places (no thousands separators,
          // no currency symbol), so Number() is an exact, lossless
          // conversion here — not a general-purpose float parse. The
          // generated Insert type wants `number` for numeric(15,2); we
          // convert for real rather than casting past the type check.
          amount: Number(invoice.amount),
          // The product is INR-only today; set this explicitly rather than
          // relying on the column default so a future multi-currency org
          // can't silently get the wrong value if the default ever changes.
          currency: "INR",
          issue_date: invoice.issue_date,
          due_date: invoice.due_date,
          external_ref: invoice.external_ref || null,
        })),
      )
      .select("id");

    if (error) {
      console.error("[invoices] import failed", { code: error.code, message: error.message });
      if (error.code === "23505")
        return {
          ok: false,
          code: error.code,
          message: "An invoice with this number already exists for this account.",
        };
      if (error.code === "42501")
        return {
          ok: false,
          code: error.code,
          message: "Your session expired. Please sign in again.",
        };
      return {
        ok: false,
        code: error.code,
        message: "Couldn't save these invoices. Please try again.",
      };
    }
    return { ok: true, created: inserted.length };
  });

export type InvoiceRow = {
  id: string;
  account_id: string;
  invoice_number: string;
  amount: number;
  issue_date: string;
  due_date: string;
  currency: string;
  status: "draft" | "open" | "partially_paid" | "paid" | "void" | "written_off";
  disputed_at: string | null;
  promised_date: string | null;
  promised_at: string | null;
  promise_broken_count: number;
  last_promise_broken_at: string | null;
  amount_paid: number;
};

type InvoiceQueryRow = Pick<
  InvoiceRow,
  | "id"
  | "account_id"
  | "invoice_number"
  | "amount"
  | "issue_date"
  | "due_date"
  | "currency"
  | "status"
  | "disputed_at"
  | "promised_date"
  | "promised_at"
  | "promise_broken_count"
  | "last_promise_broken_at"
>;

type PaymentQueryRow = {
  invoice_id: string;
  amount: number;
};

export const getInvoices = createServerFn({ method: "GET" })
  .validator(importInvoicesSchema.pick({ org_id: true }))
  .handler(async ({ data }): Promise<InvoiceRow[]> => {
    const supabase = getUserSupabase();
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select(
        "id, account_id, invoice_number, amount, issue_date, due_date, currency, status, " +
          "disputed_at, promised_date, promised_at, promise_broken_count, last_promise_broken_at",
      )
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Couldn't load invoices.");

    // Build invoice IDs for targeted payment lookup
    const invoiceList = invoices ? (invoices as unknown as InvoiceQueryRow[]) : [];
    const invoiceIds = invoiceList.map((inv) => inv.id);

    // Fetch payment totals with pagination to avoid truncation at 1000 rows
    const allPayments: PaymentQueryRow[] = [];
    if (invoiceIds.length > 0) {
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: payments, error: paymentsError } = await supabase
          .from("payments")
          .select("invoice_id, amount")
          .eq("org_id", data.org_id)
          // A stable order so pages don't skip or repeat rows. No .in() on
          // invoice IDs: org_id already scopes this, and listing every ID
          // makes the URL too long once an org has a few hundred invoices.
          .order("id")
          .range(offset, offset + pageSize - 1);

        if (paymentsError) throw new Error("Couldn't load payment data.");

        if (!payments || payments.length === 0) {
          hasMore = false;
        } else {
          allPayments.push(...(payments as unknown as PaymentQueryRow[]));
          if (payments.length < pageSize) {
            hasMore = false;
          } else {
            offset += pageSize;
          }
        }
      }
    }

    const paymentsByInvoice = new Map<string, number>();
    allPayments.forEach((payment) => {
      const current = paymentsByInvoice.get(payment.invoice_id) ?? 0;
      paymentsByInvoice.set(payment.invoice_id, current + payment.amount);
    });

    // Add calculated amount_paid to each invoice
    return invoiceList.map((inv) => ({
      ...inv,
      amount_paid: paymentsByInvoice.get(inv.id) ?? 0,
    }));
  });
