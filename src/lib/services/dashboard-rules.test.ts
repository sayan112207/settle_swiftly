import { describe, expect, test } from "bun:test";

import {
  agingTotals,
  eligibleInvoices,
  ineligibleReason,
  paiseToMoney,
  priorityReason,
  promisePauseActive,
  scoreQueue,
  sharePct,
  todayInTimezone,
  toPaise,
  valueScale,
  type BookInvoice,
} from "@/lib/services/dashboard-rules";

const TODAY = "2026-08-17";

let seq = 0;
function invoice(overrides: Partial<BookInvoice> = {}): BookInvoice {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    accountId: "acct-1",
    accountName: "Meridian Industries Pvt Ltd",
    invoiceNumber: `INV-${1000 + seq}`,
    dueDate: "2026-07-10", // 38 days overdue on TODAY
    outstandingPaise: 100_000_00,
    partiallyPaid: false,
    disputed: false,
    promisedDate: null,
    promisedAt: null,
    promiseBrokenCount: 0,
    lastPromiseBrokenAt: null,
    reminderCount: 0,
    lastReminderOn: null,
    accountPaused: false,
    accountHasUsableP0: true,
    ...overrides,
  };
}

describe("eligibility", () => {
  test("excludes disputed", () => {
    expect(ineligibleReason(invoice({ disputed: true }), TODAY)).toBe("Disputed");
  });

  test("excludes an account without a usable P0 (missing or bounced)", () => {
    expect(ineligibleReason(invoice({ accountHasUsableP0: false }), TODAY)).toBe(
      "No usable P0 contact",
    );
  });

  test("includes partially paid", () => {
    expect(ineligibleReason(invoice({ partiallyPaid: true }), TODAY)).toBeNull();
  });

  test("excludes not yet due, including due today", () => {
    expect(ineligibleReason(invoice({ dueDate: TODAY }), TODAY)).toBe("Not yet due");
  });

  test("excludes a paused account", () => {
    expect(ineligibleReason(invoice({ accountPaused: true }), TODAY)).toBe("Account paused");
  });

  test("an active promise pauses the chase", () => {
    const promised = invoice({ promisedDate: "2026-08-20", promisedAt: "2026-08-10" });
    expect(ineligibleReason(promised, TODAY)).toBe("Promise pending");
  });

  test("a promise beyond 45 days is capped at promised_at + 45", () => {
    const farOut = { promisedDate: "2026-12-31", promisedAt: "2026-07-01" };
    // cap = 2026-08-15, so the pause is over by TODAY
    expect(promisePauseActive(farOut, "2026-08-15")).toBe(true);
    expect(promisePauseActive(farOut, TODAY)).toBe(false);
  });

  test("an expired promise re-enters the queue without any status change", () => {
    const expired = invoice({ promisedDate: "2026-08-01", promisedAt: "2026-07-20" });
    expect(ineligibleReason(expired, TODAY)).toBeNull();
    expect(expired.promisedDate).toBe("2026-08-01");
  });

  test("a promise dated in the past does not pause", () => {
    const past = { promisedDate: "2026-08-01", promisedAt: TODAY };
    expect(promisePauseActive(past, TODAY)).toBe(false);
  });

  test("eligibleInvoices keeps only chaseable rows", () => {
    const ok = invoice();
    const book = [ok, invoice({ disputed: true }), invoice({ dueDate: "2026-09-01" })];
    expect(eligibleInvoices(book, TODAY)).toEqual([ok]);
  });
});

describe("aging", () => {
  const book = [
    invoice({ dueDate: "2026-09-01", outstandingPaise: 920_000_00 }), // not yet due
    invoice({ dueDate: "2026-08-01", outstandingPaise: 260_000_00 }), // 16 days
    invoice({ dueDate: "2026-07-01", outstandingPaise: 240_000_00, disputed: true }), // 47
    invoice({ dueDate: "2026-06-01", outstandingPaise: 180_000_00 }), // 77
    invoice({ dueDate: "2026-04-01", outstandingPaise: 240_000_00 }), // 138
  ];

  test("buckets sum exactly to total outstanding", () => {
    const total = book.reduce((sum, i) => sum + i.outstandingPaise, 0);
    const bucketSum = agingTotals(book, TODAY).reduce((sum, b) => sum + b.paise, 0);
    expect(bucketSum).toBe(total);
  });

  test("includes disputed invoices and keeps contract order", () => {
    expect(agingTotals(book, TODAY)).toEqual([
      { bucket: "Not yet due", paise: 920_000_00 },
      { bucket: "1–30", paise: 260_000_00 },
      { bucket: "31–60", paise: 240_000_00 },
      { bucket: "61–90", paise: 180_000_00 },
      { bucket: "90+", paise: 240_000_00 },
    ]);
  });

  test("an active promise keeps an old invoice out of 90+", () => {
    const old = invoice({
      dueDate: "2026-04-01",
      promisedDate: "2026-08-30",
      promisedAt: "2026-08-15",
    });
    const [, , , sixtyToNinety, ninetyPlus] = agingTotals([old], TODAY);
    expect(sixtyToNinety?.paise).toBe(old.outstandingPaise);
    expect(ninetyPlus?.paise).toBe(0);
  });
});

describe("priority", () => {
  test("a low-volume org normalises by the max, not p95", () => {
    const small = [invoice({ outstandingPaise: 10_00 }), invoice({ outstandingPaise: 460_000_00 })];
    expect(valueScale(small)).toBe(460_000_00);
  });

  test("uses p95 from 15 invoices up", () => {
    const many = Array.from({ length: 20 }, (_, n) => invoice({ outstandingPaise: (n + 1) * 100 }));
    expect(valueScale(many)).toBe(1900);
  });

  test("a single zero-value invoice does not divide by zero", () => {
    const [scored] = scoreQueue([invoice({ outstandingPaise: 0 })], TODAY);
    expect(scored?.valueNorm).toBe(0);
    expect(Number.isFinite(scored?.score)).toBe(true);
  });

  test("reproduces the spec's top three bands and order", () => {
    const meridian = invoice({ outstandingPaise: 460_000_00, dueDate: "2026-07-10" }); // 38d
    const nimbus = invoice({
      accountName: "Nimbus Creative LLP",
      outstandingPaise: 280_000_00,
      dueDate: "2026-07-08", // 40d
      promiseBrokenCount: 1,
      lastPromiseBrokenAt: "2026-08-08",
    });
    const shakti = invoice({
      accountName: "Shakti Engineering Pvt Ltd",
      outstandingPaise: 240_000_00,
      dueDate: "2026-06-26", // 52d
      reminderCount: 2,
      lastReminderOn: "2026-08-01",
    });
    const ranked = scoreQueue([shakti, nimbus, meridian], TODAY);
    expect(ranked.map((r) => [r.invoice.id, r.band, r.reason])).toEqual([
      [meridian.id, "Escalate", "Largest overdue balance, 38 days"],
      [nimbus.id, "Escalate", "Promise broken on 8 Aug"],
      [shakti.id, "Escalate", "Second reminder went unanswered"],
    ]);
  });
});

describe("reason resolver", () => {
  const ctx = { today: TODAY, days: 44, valueNorm: 0.1, isLargest: true };

  test("first match wins", () => {
    const everything = invoice({
      promiseBrokenCount: 1,
      lastPromiseBrokenAt: "2026-08-08",
      reminderCount: 2,
      lastReminderOn: "2026-08-01",
    });
    expect(priorityReason(everything, ctx)).toBe("Promise broken on 8 Aug");
    expect(priorityReason(invoice({ reminderCount: 2, lastReminderOn: "2026-08-01" }), ctx)).toBe(
      "Second reminder went unanswered",
    );
    expect(priorityReason(invoice(), ctx)).toBe("Largest overdue balance, 44 days");
    expect(priorityReason(invoice(), { ...ctx, isLargest: false })).toBe(
      "Crosses the 45-day mark tomorrow",
    );
  });

  test("the remaining rules, in order", () => {
    const base = { today: TODAY, isLargest: false };
    expect(priorityReason(invoice(), { ...base, days: 61, valueNorm: 0.05 })).toBe(
      "Small amount but 61 days old",
    );
    expect(priorityReason(invoice(), { ...base, days: 9, valueNorm: 0.1 })).toBe(
      "Small balance, first reminder due",
    );
    expect(
      priorityReason(invoice({ reminderCount: 1, lastReminderOn: "2026-08-15" }), {
        ...base,
        days: 20,
        valueNorm: 0.5,
      }),
    ).toBe("20 days overdue");
  });
});

describe("money and dates", () => {
  test("paise round-trip through the contract's decimal strings", () => {
    expect(paiseToMoney(toPaise(1840000))).toBe("1840000.00");
    expect(paiseToMoney(toPaise(0.1 + 0.2))).toBe("0.30");
    expect(paiseToMoney(toPaise(1234.05))).toBe("1234.05");
  });

  test("share is one decimal and 0 for an empty book", () => {
    expect(sharePct(260_000, 1_840_000)).toBe(14.1);
    expect(sharePct(0, 0)).toBe(0);
  });

  test("today is the org's calendar date, not the server's", () => {
    const lateUtc = new Date("2026-08-16T20:00:00Z"); // 01:30 on the 17th in Kolkata
    expect(todayInTimezone("Asia/Kolkata", lateUtc)).toBe("2026-08-17");
    expect(todayInTimezone("Not/AZone", lateUtc)).toBe("2026-08-17");
  });
});
