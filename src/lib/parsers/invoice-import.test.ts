import { describe, expect, test } from "bun:test";

import { parseDelimitedInvoices } from "@/lib/parsers/invoice-import";

describe("invoice import parsing", () => {
  test("parses CSV, quoted values, Indian currency, and common headers", () => {
    const rows = parseDelimitedInvoices(
      'Account,Invoice #,Amount,Invoice date,Due date,Notes\n"Acme, Ltd",INV-0042,"₹1,15,000.50",01/08/2026,31/08/2026,First import',
      ",",
    );
    expect(rows[0]?.account).toBe("Acme, Ltd");
    expect(rows[0]?.amount).toBe("115000.50");
    expect(rows[0]?.issue_date).toBe("2026-08-01");
  });

  test("parses spreadsheet paste rows", () => {
    const rows = parseDelimitedInvoices(
      "Account\tInvoice #\tAmount\tInvoice date\tDue date\nAcme\tINV-1\t500\t2026-08-01\t2026-08-30",
      "\t",
    );
    expect(rows[0]?.invoice_number).toBe("INV-1");
  });

  test("rejects malformed CSV and missing columns", () => {
    expect(() => parseDelimitedInvoices('Account,Invoice #\n"Acme,INV-1', ",")).toThrow("unclosed");
    expect(() => parseDelimitedInvoices("Account,Invoice #\nAcme,INV-1", ",")).toThrow(
      "Missing required",
    );
  });
});
