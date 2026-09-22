import { describe, expect, test } from "bun:test";

import { skippedLabel } from "@/routes/app/chasing";
import type { ChaseQueueItem, ChaseSkipped } from "@/lib/schemas/dashboard";

const ITEMS: ChaseQueueItem[] = [
  {
    invoice_id: "11111111-1111-1111-1111-111111111111",
    account_id: "22222222-2222-2222-2222-222222222222",
    account_name: "Sharma Traders Pvt Ltd",
    invoice_number: "INV-1042",
    amount_outstanding: "54000.00",
    days_overdue: 14,
    priority_band: "Chase now",
    priority_reason: "14 days overdue with no promise on file.",
  },
];

describe("skippedLabel", () => {
  test("returns an empty string when nothing was skipped", () => {
    expect(skippedLabel([], ITEMS)).toBe("");
  });

  test("pairs a known invoice's number with the server's reason", () => {
    const skipped: ChaseSkipped[] = [{ invoice_id: ITEMS[0]!.invoice_id, reason: "Disputed" }];
    expect(skippedLabel(skipped, ITEMS)).toBe("INV-1042 (Disputed)");
  });

  test("falls back to the raw invoice id if it isn't in the loaded items", () => {
    const skipped: ChaseSkipped[] = [
      { invoice_id: "99999999-9999-9999-9999-999999999999", reason: "Paid" },
    ];
    expect(skippedLabel(skipped, ITEMS)).toBe("99999999-9999-9999-9999-999999999999 (Paid)");
  });

  test("joins multiple skipped entries with a comma", () => {
    const skipped: ChaseSkipped[] = [
      { invoice_id: ITEMS[0]!.invoice_id, reason: "Disputed" },
      { invoice_id: "99999999-9999-9999-9999-999999999999", reason: "Paid" },
    ];
    expect(skippedLabel(skipped, ITEMS)).toBe(
      "INV-1042 (Disputed), 99999999-9999-9999-9999-999999999999 (Paid)",
    );
  });
});
