import { z } from "zod";

/**
 * `YYYY-MM-DD`, and the date must actually exist on the calendar (rejects
 * 2026-02-30, 2026-02-31, 2026-04-31, 2026-13-01, etc.). Regex alone only
 * checks the shape, so we round-trip through `Date.UTC` and compare the
 * parts back out — an invalid calendar date rolls over (e.g. Feb 31 becomes
 * Mar 3) rather than throwing, so a mismatch after round-tripping is how we
 * detect it.
 */
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .refine(isValidCalendarDate, "Enter a real calendar date.");

/**
 * Checks whether a `YYYY-MM-DD` string names a date that actually exists on
 * the calendar. Round-trips the parts through `Date.UTC` and compares them
 * back out, since an invalid date (e.g. Feb 31) silently rolls forward
 * instead of throwing — a mismatch after the round trip is how we detect it.
 */
function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const decimalMoneySchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places.")
  .refine((value) => Number(value) > 0, "Amount must be positive.");

// Plain ZodObject — used as-is by both the single-draft schema below and, via
// .superRefine, by the array-item schema in importInvoicesSchema. There is no
// `notes` column on public.invoices (see the migration), so this schema has
// no notes field — do not add one without a corresponding column/migration.
const invoiceDraftObjectSchema = z.object({
  account_id: z.string().uuid("Choose an account."),
  invoice_number: z.string().trim().min(1, "Invoice number is required.").max(200),
  amount: decimalMoneySchema,
  issue_date: dateSchema,
  due_date: dateSchema,
  external_ref: z.string().trim().max(200).optional(),
});

/**
 * Zod `superRefine` check shared by `invoiceDraftSchema` and
 * `importInvoicesSchema`: flags `due_date` as invalid when it falls before
 * `issue_date`. Relies on both fields already being validated,
 * zero-padded `YYYY-MM-DD` strings, so plain string comparison matches
 * calendar order.
 */
function checkDueDate(value: { issue_date: string; due_date: string }, ctx: z.RefinementCtx) {
  if (value.due_date < value.issue_date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["due_date"],
      message: "Due date cannot precede invoice date.",
    });
  }
}

export const invoiceDraftSchema = invoiceDraftObjectSchema.superRefine(checkDueDate);

/**
 * A draft whose account does not exist yet — an import naming a customer the
 * org has never billed, or the manual form adding one inline.
 *
 * Every other field is held to the same standard; only the account differs,
 * because there is no id to validate until the account is created. That
 * happens immediately before the batch is saved, and the draft is re-checked
 * against `invoiceDraftSchema` on the way out, so nothing reaches the database
 * having been validated only by this looser schema.
 */
export const invoiceDraftPendingAccountSchema = invoiceDraftObjectSchema
  .omit({ account_id: true })
  .extend({
    account_name: z
      .string()
      .trim()
      .min(1, "Choose an account.")
      .max(200, "That account name is longer than 200 characters."),
  })
  .superRefine(checkDueDate);

export const importInvoicesSchema = z.object({
  org_id: z.string().uuid(),
  // Same object + refinement as invoiceDraftSchema (no separate .omit() step
  // needed now that the draft object has no fields the import path excludes).
  invoices: z.array(invoiceDraftObjectSchema.superRefine(checkDueDate)).min(1).max(500),
});

/**
 * URL search for `/app/add-entries`. `.catch` keeps a mistyped link on the
 * manual tab rather than crashing the route.
 */
export const addEntriesSearchSchema = z.object({
  mode: z.enum(["manual", "upload", "paste"]).default("manual").catch("manual"),
});

export type AddEntriesSearch = z.infer<typeof addEntriesSearchSchema>;
export type InvoiceDraftInput = z.infer<typeof invoiceDraftSchema>;
export type InvoiceDraftPendingAccountInput = z.infer<typeof invoiceDraftPendingAccountSchema>;
export type ImportInvoicesInput = z.infer<typeof importInvoicesSchema>;
