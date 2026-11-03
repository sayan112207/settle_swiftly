import { decimalMoneySchema } from "@/lib/schemas/invoices";

export type ParsedInvoiceRow = {
  account: string;
  invoice_number: string;
  amount: string;
  issue_date: string;
  due_date: string;
  external_ref?: string;
};

const HEADER_ALIASES: Record<keyof ParsedInvoiceRow, readonly string[]> = {
  account: ["account", "account name", "customer", "customer name"],
  invoice_number: ["invoice", "invoice #", "invoice number", "number"],
  amount: ["amount", "amount gross", "gross amount", "invoice amount"],
  issue_date: ["invoice date", "issue date", "date"],
  due_date: ["due date", "due"],
  external_ref: ["po", "po number", "purchase order"],
};

/**
 * Parses a delimited invoice import (CSV upload or spreadsheet paste) into
 * rows ready for draft validation. Accepts either `,` or `\t` as the
 * delimiter, matches columns by header aliases regardless of order, and
 * normalizes each cell's money and date formatting. Throws when the input
 * has no header/data rows, a required column is missing, or a quoted value
 * is left unclosed.
 */
export function parseDelimitedInvoices(input: string, delimiter: "," | "\t"): ParsedInvoiceRow[] {
  const rows = parseRows(input, delimiter).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length < 2) throw new Error("Add a header row and at least one invoice.");

  const header = rows[0]!.map(normalizeHeader);
  const indexFor = (field: keyof ParsedInvoiceRow) =>
    header.findIndex((value) => HEADER_ALIASES[field].includes(value));
  const indexes = {
    account: indexFor("account"),
    invoice_number: indexFor("invoice_number"),
    amount: indexFor("amount"),
    issue_date: indexFor("issue_date"),
    due_date: indexFor("due_date"),
    external_ref: indexFor("external_ref"),
  };
  const required = ["account", "invoice_number", "amount", "issue_date", "due_date"] as const;
  const missing = required.filter((field) => indexes[field] === -1);
  if (missing.length > 0)
    throw new Error(
      `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
    );

  return rows.slice(1).map((row) => ({
    account: cell(row, indexes.account),
    invoice_number: cell(row, indexes.invoice_number),
    amount: normalizeMoney(cell(row, indexes.amount)),
    issue_date: normalizeDate(cell(row, indexes.issue_date)),
    due_date: normalizeDate(cell(row, indexes.due_date)),
    ...(indexes.external_ref === -1 ? {} : { external_ref: cell(row, indexes.external_ref) }),
  }));
}

/**
 * Splits delimited text into rows of cells, honoring double-quoted values
 * (including embedded delimiters, embedded newlines, and `""`-escaped
 * quotes) and both `\n` and `\r\n` line endings. Throws if a quoted value is
 * never closed.
 */
function parseRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [[]];
  let value = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      rows.at(-1)!.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      rows.at(-1)!.push(value);
      rows.push([]);
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted value.");
  rows.at(-1)!.push(value);
  return rows;
}

/** Lowercases, trims, and collapses whitespace in a header cell so it can be matched against `HEADER_ALIASES`. */
function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
/** Reads a row's cell by column index, trimmed, or `""` if the column is absent from this row. */
function cell(row: string[], index: number) {
  return (row[index] ?? "").trim();
}

/**
 * Strips `₹`, thousands separators, and surrounding whitespace from an
 * imported amount cell. Returns the cleaned digits-and-decimal string only
 * when it matches `decimalMoneySchema`; otherwise returns the original
 * trimmed value unchanged so schema validation can report a clear error.
 */
export function normalizeMoney(value: string): string {
  const normalized = value.replace(/[₹,\s]/g, "");
  return decimalMoneySchema.safeParse(normalized).success ? normalized : value.trim();
}

/**
 * Converts an imported date cell to `YYYY-MM-DD`. Passes an already-ISO
 * value through unchanged, and reinterprets a `D/M/YYYY`- or
 * `D-M-YYYY`-shaped value as day/month/year (this product's regional date
 * format). Any other shape is returned unchanged so schema validation can
 * report a clear error rather than this function guessing.
 */
function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (!match) return trimmed;
  const [, day, month, year] = match;
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}
