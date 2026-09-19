import { describe, expect, test } from "bun:test";

import type { AccountListItem } from "@/lib/schemas/accounts";
import {
  accountFigures,
  activityWhenLabel,
  avgDaysLate,
  chaseDisabledReason,
  contactPip,
  escalationContacts,
  filterAccounts,
  headerStatus,
  invoiceStatus,
  mergeSteps,
  paymentStatus,
  resolveChaseStatus,
  sortAccounts,
  stepOverridesProblem,
  type AccountChaseFacts,
  type ContactFacts,
  type LadderContact,
} from "@/lib/services/accounts-rules";
import { agingTotals, daysOverdue, type BookInvoice } from "@/lib/services/dashboard-rules";

const TODAY = "2026-08-17";
const active: AccountChaseFacts = { pausedAt: null, pausedUntil: null, chaseMode: "default" };

function contact(overrides: Partial<ContactFacts> = {}): ContactFacts {
  return {
    tier: "P0",
    name: "Rajat Mehta",
    doNotContact: false,
    deliveryState: "verified",
    ...overrides,
  };
}

let seq = 0;
function invoice(overrides: Partial<BookInvoice> = {}): BookInvoice {
  seq += 1;
  return {
    id: `inv-${seq}`,
    accountId: "acct",
    accountName: "Sharma Traders",
    invoiceNumber: `INV-${seq}`,
    dueDate: "2026-07-10",
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

describe("chase status (contract §2.1)", () => {
  test("no_p0 beats bounced", () => {
    const onlyP1 = [contact({ tier: "P1", deliveryState: "bounced" })];
    expect(resolveChaseStatus(active, onlyP1, TODAY)).toBe("no_p0");
  });

  test("a do-not-contact P0 is not a usable P0", () => {
    expect(resolveChaseStatus(active, [contact({ doNotContact: true })], TODAY)).toBe("no_p0");
  });

  test("bounced_p0 is distinct from no_p0, and needs every usable P0 bounced", () => {
    expect(resolveChaseStatus(active, [contact({ deliveryState: "bounced" })], TODAY)).toBe(
      "bounced_p0",
    );
    const oneWorks = [contact({ deliveryState: "bounced" }), contact({ name: "Asha" })];
    expect(resolveChaseStatus(active, oneWorks, TODAY)).toBe("active");
  });

  test("contact problems outrank a pause", () => {
    const paused = { ...active, pausedAt: "2026-08-01T00:00:00Z" };
    expect(resolveChaseStatus(paused, [], TODAY)).toBe("no_p0");
  });

  test("paused_until in the past is active; today is still paused", () => {
    const until = (d: string) => ({ ...active, pausedAt: "2026-08-01T00:00:00Z", pausedUntil: d });
    expect(resolveChaseStatus(until("2026-08-16"), [contact()], TODAY)).toBe("active");
    expect(resolveChaseStatus(until(TODAY), [contact()], TODAY)).toBe("paused");
  });

  test("a Settings stop reads as paused", () => {
    expect(resolveChaseStatus({ ...active, chaseMode: "stopped" }, [contact()], TODAY)).toBe(
      "paused",
    );
  });

  test("header copy per status", () => {
    const facts = { ...active, pauseReason: "Dispute", stopReason: null };
    expect(headerStatus("no_p0", facts)).toBe("Can't chase — no primary contact");
    expect(headerStatus("bounced_p0", facts)).toBe("Chasing paused — email bouncing");
    expect(headerStatus("paused", { ...facts, pausedUntil: "2026-08-22" })).toBe(
      "Chasing paused — Dispute until 22 Aug",
    );
    expect(
      headerStatus("paused", { ...facts, chaseMode: "stopped", stopReason: "Relationship hold" }),
    ).toBe("Chasing stopped — Relationship hold");
  });
});

describe("contact pips", () => {
  test("four states, per tier", () => {
    const ladder = [
      contact({ deliveryState: "bounced" }),
      contact({ tier: "P1" }),
      contact({ tier: "P2", doNotContact: true }),
    ];
    expect(contactPip(ladder, "P0")).toBe("bounced");
    expect(contactPip(ladder, "P1")).toBe("present");
    expect(contactPip(ladder, "P2")).toBe("dnc");
    expect(contactPip([], "P1")).toBe("missing");
  });

  test("several contacts on one tier: one reachable is enough", () => {
    const twoP0 = [contact({ deliveryState: "bounced" }), contact({ name: "Asha" })];
    expect(contactPip(twoP0, "P0")).toBe("present");
  });
});

describe("avg_days_late", () => {
  test("null under three samples, never zero", () => {
    const two = [
      { dueDate: "2026-06-01", paidOn: "2026-06-11" },
      { dueDate: "2026-07-01", paidOn: "2026-07-21" },
    ];
    expect(avgDaysLate(two, TODAY)).toBeNull();
  });

  test("mean of the last 12 months only, rounded", () => {
    const samples = [
      { dueDate: "2026-06-01", paidOn: "2026-06-11" }, // 10
      { dueDate: "2026-07-01", paidOn: "2026-07-21" }, // 20
      { dueDate: "2026-05-01", paidOn: "2026-06-01" }, // 31
      { dueDate: "2025-01-01", paidOn: "2025-03-01" }, // older than a year: ignored
    ];
    expect(avgDaysLate(samples, TODAY)).toBe(20);
  });
});

describe("account figures", () => {
  const book = [
    invoice({ dueDate: "2026-09-01", outstandingPaise: 172_000_00 }),
    invoice({ dueDate: "2026-08-01", outstandingPaise: 94_000_00 }),
    invoice({ dueDate: "2026-06-01", outstandingPaise: 116_000_00 }),
    invoice({ dueDate: "2026-05-01", outstandingPaise: 100_000_00, disputed: true }),
  ];

  test("aging sums to outstanding", () => {
    const figures = accountFigures(book, TODAY);
    const aging = agingTotals(book, TODAY).reduce((sum, b) => sum + b.paise, 0);
    expect(aging).toBe(figures.outstandingPaise);
  });

  test("overdue = outstanding − not yet due", () => {
    const figures = accountFigures(book, TODAY);
    const notYetDue = agingTotals(book, TODAY)[0]?.paise ?? 0;
    expect(figures.overduePaise).toBe(figures.outstandingPaise - notYetDue);
  });

  test("oldest overdue is null when nothing is overdue", () => {
    expect(
      accountFigures([invoice({ dueDate: "2026-09-01" })], TODAY).oldestOverdueDays,
    ).toBeNull();
    expect(accountFigures(book, TODAY).oldestOverdueDays).toBe(
      daysOverdue({ dueDate: "2026-05-01" }, TODAY),
    );
  });
});

describe("invoice rows", () => {
  test("status per invoice", () => {
    expect(invoiceStatus(invoice({ disputed: true }), TODAY)).toBe("Disputed");
    expect(
      invoiceStatus(invoice({ promisedAt: "2026-08-10", promisedDate: "2026-08-22" }), TODAY),
    ).toBe("Promised");
    expect(invoiceStatus(invoice({ dueDate: "2026-09-01" }), TODAY)).toBe("Not yet due");
    expect(invoiceStatus(invoice({ partiallyPaid: true }), TODAY)).toBe("Partially paid");
    expect(invoiceStatus(invoice(), TODAY)).toBe("Open");
  });

  test("account-level blocks come before invoice-level ones", () => {
    const bounced = [contact({ deliveryState: "bounced" })];
    expect(chaseDisabledReason(invoice({ disputed: true }), "bounced_p0", bounced, TODAY)).toBe(
      "Can't chase — Rajat Mehta's email is bouncing",
    );
    expect(chaseDisabledReason(invoice(), "active", [contact()], TODAY)).toBeNull();
    expect(chaseDisabledReason(invoice({ dueDate: "2026-09-01" }), "active", [], TODAY)).toBe(
      "Not due yet",
    );
  });
});

describe("cadence", () => {
  test("overrides lay over the default in step order", () => {
    const steps = mergeSteps([
      { key: "s3", tone: "Firm", channel: "whatsapp", recipients: "p0p1" },
    ]);
    expect(steps.map((s) => s.key)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect([steps[2]?.tone, steps[2]?.channel, steps[2]?.label]).toEqual([
      "Firm",
      "whatsapp",
      "+7",
    ]);
    expect(steps[0]?.tone).toBe("Gentle");
  });

  test("voice is refused before the late steps, and unknown steps are refused", () => {
    const problem = (key: string, channel: "voice" | "email") =>
      stepOverridesProblem([{ key, tone: "Firm", channel, recipients: "p0" }]);
    expect(problem("s2", "voice") === null).toBe(false);
    expect(problem("s5", "voice")).toBeNull();
    expect(problem("s9", "email") === null).toBe(false);
  });

  test("escalation summary: first reachable per tier, placeholder when empty", () => {
    const ladder: LadderContact[] = [
      {
        ...contact(),
        designation: "Accounts Executive",
        channelEmail: true,
        channelWhatsapp: true,
        channelSms: false,
        sortOrder: 0,
      },
    ];
    expect(escalationContacts(ladder)).toEqual([
      { tier: "P0", name: "Rajat Mehta", detail: "Accounts Executive · Email, WhatsApp" },
      { tier: "P1", name: null, detail: "Finance head" },
      { tier: "P2", name: null, detail: "Owner or director" },
    ]);
  });
});

describe("accounts list", () => {
  function row(overrides: Partial<AccountListItem>): AccountListItem {
    return {
      account_id: `a-${(seq += 1)}`,
      name: "Account",
      outstanding: "0.00",
      overdue: "0.00",
      open_count: 0,
      oldest_overdue_days: null,
      avg_days_late: null,
      contacts: { p0: "present", p1: "missing", p2: "missing" },
      chase_status: "active",
      status_label: "Active",
      ...overrides,
    };
  }

  const a = row({ name: "Anand", outstanding: "95000.00", overdue: "95000.00" });
  const b = row({ name: "Bharat", outstanding: "482000.00", chase_status: "bounced_p0" });
  const c = row({ name: "Chitra", outstanding: "10000.00", chase_status: "paused" });

  test("filters narrow together", () => {
    expect(filterAccounts([a, b, c], ["has_overdue"])).toEqual([a]);
    expect(filterAccounts([a, b, c], ["missing_contacts"])).toEqual([b]);
    expect(filterAccounts([a, b, c], ["paused"])).toEqual([c]);
    expect(filterAccounts([a, b, c], ["has_overdue", "paused"])).toEqual([]);
  });

  test("money sorts numerically, not as strings", () => {
    expect(sortAccounts([a, b, c], "outstanding", "desc").map((r) => r.name)).toEqual([
      "Bharat",
      "Anand",
      "Chitra",
    ]);
    expect(sortAccounts([a, b, c], "name", "asc").map((r) => r.name)).toEqual([
      "Anand",
      "Bharat",
      "Chitra",
    ]);
  });
});

describe("payments", () => {
  test("settled, TDS shortfall on the pre-GST base, and a plain part payment", () => {
    expect(paymentStatus(118_000_00, 0, 10).label).toBe("Settled in full");
    const tds = paymentStatus(118_000_00, 10_000_00, 10);
    expect([tds.label, tds.actionKind]).toEqual(["TDS shortfall ₹10,000", "adjust"]);
    const part = paymentStatus(118_000_00, 25_000_00, 10);
    expect([part.label, part.actionKind]).toEqual([
      "Part payment · ₹25,000 still due",
      "view_split",
    ]);
    expect(paymentStatus(118_000_00, 10_000_00, null).label).toBe(
      "Part payment · ₹10,000 still due",
    );
  });
});

describe("activity labels", () => {
  const now = new Date("2026-08-17T03:42:00Z"); // 09:12 in Kolkata

  test("today, yesterday, this year, older", () => {
    expect(activityWhenLabel("2026-08-17T03:41:30Z", "Asia/Kolkata", now)).toBe("Just now");
    expect(activityWhenLabel("2026-08-17T01:00:00Z", "Asia/Kolkata", now)).toBe("Today · 06:30");
    expect(activityWhenLabel("2026-08-16T12:00:00Z", "Asia/Kolkata", now)).toBe(
      "Yesterday · 17:30",
    );
    expect(activityWhenLabel("2026-08-12T11:10:00Z", "Asia/Kolkata", now)).toBe("12 Aug · 16:40");
    expect(activityWhenLabel("2025-12-30T11:10:00Z", "Asia/Kolkata", now)).toBe("30 Dec 2025");
  });
});
