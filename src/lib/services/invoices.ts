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

export const getInvoices = createServerFn({ method: "GET" })
  .validator(importInvoicesSchema.pick({ org_id: true }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any[]> => {
    const supabase = getUserSupabase();
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("id, account_id, invoice_number, amount, issue_date, due_date, currency, status")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Couldn't load invoices.");
    return invoices;
  });
