import { describe, expect, test } from "bun:test";

import { importInvoicesSchema, invoiceDraftSchema } from "@/lib/schemas/invoices";

const VALID_DRAFT = {
  account_id: "11111111-1111-1111-1111-111111111111",
  invoice_number: "INV-1",
  amount: "500.00",
  issue_date: "2026-08-01",
  due_date: "2026-08-30",
};

describe("invoiceDraftSchema — calendar date validation", () => {
  test("accepts real calendar dates, including leap-year Feb 29", () => {
    expect(invoiceDraftSchema.safeParse(VALID_DRAFT).success).toBe(true);
    expect(
      invoiceDraftSchema.safeParse({
        ...VALID_DRAFT,
        issue_date: "2024-02-29", // 2024 is a leap year
        due_date: "2024-03-01",
      }).success,
    ).toBe(true);
  });

  test("rejects impossible calendar dates that a regex-only check would miss", () => {
    const impossibleDates = ["2026-02-31", "2026-02-30", "2026-13-01", "2026-04-31", "2023-02-29"];
    for (const issue_date of impossibleDates) {
      const result = invoiceDraftSchema.safeParse({ ...VALID_DRAFT, issue_date });
      expect(result.success).toBe(false);
    }
  });

  test("rejects malformed date shapes", () => {
    for (const issue_date of ["2026/08/01", "08-01-2026", "2026-8-1", "not-a-date", ""]) {
      expect(invoiceDraftSchema.safeParse({ ...VALID_DRAFT, issue_date }).success).toBe(false);
    }
  });
});

describe("invoiceDraftSchema — due date ordering", () => {
  test("accepts due_date equal to issue_date", () => {
    expect(
      invoiceDraftSchema.safeParse({
        ...VALID_DRAFT,
        issue_date: "2026-08-01",
        due_date: "2026-08-01",
      }).success,
    ).toBe(true);
  });

  test("accepts due_date after issue_date", () => {
    expect(
      invoiceDraftSchema.safeParse({
        ...VALID_DRAFT,
        issue_date: "2026-08-01",
        due_date: "2026-08-30",
      }).success,
    ).toBe(true);
  });

  test("rejects due_date before issue_date", () => {
    const result = invoiceDraftSchema.safeParse({
      ...VALID_DRAFT,
      issue_date: "2026-08-10",
      due_date: "2026-08-01",
    });
    expect(result.success).toBe(false);
  });
});

describe("importInvoicesSchema — shares the same date rules as invoiceDraftSchema", () => {
  test("accepts a batch of valid invoices", () => {
    const result = importInvoicesSchema.safeParse({
      org_id: "22222222-2222-2222-2222-222222222222",
      invoices: [VALID_DRAFT],
    });
    expect(result.success).toBe(true);
  });

  test("rejects a batch containing an impossible calendar date", () => {
    const result = importInvoicesSchema.safeParse({
      org_id: "22222222-2222-2222-2222-222222222222",
      invoices: [{ ...VALID_DRAFT, due_date: "2026-02-30" }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects a batch where due_date precedes issue_date", () => {
    const result = importInvoicesSchema.safeParse({
      org_id: "22222222-2222-2222-2222-222222222222",
      invoices: [{ ...VALID_DRAFT, issue_date: "2026-08-10", due_date: "2026-08-01" }],
    });
    expect(result.success).toBe(false);
  });
});
