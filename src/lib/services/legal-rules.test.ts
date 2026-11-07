import { describe, expect, test } from "bun:test";

import {
  advocatesResponseSchema,
  eligibleResponseSchema,
  matterDetailSchema,
  matterSummarySchema,
  type ThreadEntry,
} from "@/lib/schemas/legal";
import {
  attachmentError,
  defaultDemandText,
  eligibleSummary,
  fileBadge,
  formatFileSize,
  formatThreadTime,
  escalationEligible,
  groupThreadByDay,
  joinNames,
  MIN_FOLLOW_UPS,
  nextStepForStage,
  parseInvoiceIds,
  qualifyLabel,
  routeCount,
  selectableIds,
  selectionSummary,
  serialiseInvoiceIds,
  stageStrip,
  statutoryRoutesOpen,
  totalMatterCost,
} from "@/lib/services/legal-rules";
import {
  advocateMatterDetailsFixture,
  advocateMattersFixture,
  advocatesFixture,
  businessMatterDetailsFixture,
  eligibleFixture,
  LEGAL_INVOICE_IDS,
  legalMockStore,
  mattersFixture,
  resetLegalMockStore,
} from "@/lib/services/legal.mocks";
import { weeklyReportFixture } from "@/lib/services/reports.mocks";

describe("statutory routes", () => {
  test("open to a registered small manufacturer or service provider", () => {
    expect(
      statutoryRoutesOpen({ udyam_registered: true, enterprise_size: "small", is_trader: false }),
    ).toBe(true);
    expect(routeCount({ udyam_registered: true, enterprise_size: "micro", is_trader: false })).toBe(
      4,
    );
  });

  test("closed to traders, medium enterprises and the unregistered", () => {
    expect(
      statutoryRoutesOpen({ udyam_registered: true, enterprise_size: "small", is_trader: true }),
    ).toBe(false);
    expect(
      statutoryRoutesOpen({ udyam_registered: true, enterprise_size: "medium", is_trader: false }),
    ).toBe(false);
    expect(
      statutoryRoutesOpen({ udyam_registered: false, enterprise_size: null, is_trader: false }),
    ).toBe(false);
    expect(routeCount({ udyam_registered: false, enterprise_size: null, is_trader: false })).toBe(
      2,
    );
  });
});

describe("eligible list", () => {
  test("is the reports fixture's 90+ aged debt, invoice for invoice", () => {
    if (!weeklyReportFixture.has_report) throw new Error("fixture must be a ready report");
    const aged = new Map(
      weeklyReportFixture.aged_debt.map((item) => [item.invoice_id, item.amount_outstanding]),
    );
    const eligible = new Map(
      eligibleFixture.items.map((item) => [item.invoice_id, item.amount_outstanding]),
    );
    expect([...eligible.keys()].sort()).toEqual([...aged.keys()].sort());
    for (const [id, amount] of eligible) expect(aged.get(id)).toBe(amount);
  });

  test("sums to ₹3,00,000.00 across five accounts, oldest 108 days", () => {
    expect(eligibleSummary(eligibleFixture.items)).toEqual({
      total: "300000.00",
      accountCount: 5,
      oldestDays: 108,
    });
  });

  test("only unlocked rows are selectable", () => {
    expect(selectableIds(eligibleFixture.items)).toEqual([
      LEGAL_INVOICE_IDS.inv1876,
      LEGAL_INVOICE_IDS.inv1733,
    ]);
  });

  test("a selection ignores locked rows even if their ids are passed", () => {
    const summary = selectionSummary(
      eligibleFixture.items,
      new Set([LEGAL_INVOICE_IDS.inv1876, LEGAL_INVOICE_IDS.inv2015]),
    );
    expect(summary.count).toBe(1);
    expect(summary.total).toBe("72000.00");
  });
});

describe("copy helpers", () => {
  test("joinNames reads naturally and de-duplicates", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A and B");
    expect(joinNames(["A", "B", "A", "C"])).toBe("A, B and C");
  });

  test("qualifyLabel", () => {
    expect(qualifyLabel(1)).toBe("this invoice qualifies");
    expect(qualifyLabel(2)).toBe("both invoices qualify");
    expect(qualifyLabel(3)).toBe("all 3 invoices qualify");
  });

  test("total cost is the advocate's fee plus the ₹999 matter fee", () => {
    expect(totalMatterCost("4500.00")).toBe("5499.00");
  });

  test("the demand only claims Section 16 interest where the statute applies", () => {
    expect(defaultDemandText("₹72,000.00", true).includes("Section 16")).toBe(true);
    expect(defaultDemandText("₹72,000.00", false).includes("Section 16")).toBe(false);
  });
});

describe("stageStrip", () => {
  test("awaiting response is the fifth step", () => {
    const strip = stageStrip("awaiting_response");
    expect(strip.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "current"]);
    expect(strip.summary).toBe("Step 5 of 5 · Awaiting response");
  });

  test("a recovered matter has every step done", () => {
    const strip = stageStrip("recovered");
    expect(strip.steps.every((s) => s.state === "done")).toBe(true);
    expect(strip.summary).toBe("All 5 steps done · Recovered");
  });
});

describe("thread", () => {
  const sharma = businessMatterDetailsFixture[mattersFixture[0]!.matter_id]!;

  test("groups by day in Indian time, oldest first", () => {
    const days = groupThreadByDay(sharma.thread);
    expect(days.map((d) => d.label)).toEqual([
      "28 July 2026",
      "3 August 2026",
      "6 August 2026",
      "12 August 2026",
    ]);
    expect(days[0]?.entries).toHaveLength(4);
  });

  test("a message at 23:30 UTC belongs to the next day in India", () => {
    const entry: ThreadEntry = {
      type: "event",
      entry_id: "e0000999-0000-4000-8000-000000000999",
      at: "2026-08-11T23:30:00Z",
      label: "x",
      attachments: [],
    };
    expect(groupThreadByDay([entry])[0]?.day).toBe("2026-08-12");
  });

  test("formatThreadTime stamps in Indian time, 24-hour", () => {
    expect(formatThreadTime("2026-07-28T10:02:00+05:30")).toBe("28 Jul, 10:02");
  });

  test("orders entries by time when the payload is not chronological", () => {
    const later: ThreadEntry = {
      type: "event",
      entry_id: "e0000998-0000-4000-8000-000000000998",
      at: "2026-08-12T10:00:00+05:30",
      label: "later",
      attachments: [],
    };
    const earlier: ThreadEntry = {
      type: "message",
      entry_id: "e0000997-0000-4000-8000-000000000997",
      author: { role: "business", name: "Meridian Traders" },
      sent_at: "2026-07-28T10:02:00+05:30",
      body: "earlier",
      attachments: [],
      withdrawn_at: null,
    };
    const days = groupThreadByDay([later, earlier]);
    expect(days.map((day) => day.day)).toEqual(["2026-07-28", "2026-08-12"]);
    expect(days[0]?.entries[0]?.entry_id).toBe(earlier.entry_id);
  });
});

describe("escalationEligible", () => {
  test("drops invoices under the four-follow-up rule", () => {
    const parsed = eligibleResponseSchema.parse({
      as_of: "2026-08-16T09:00:00+05:30",
      seller: { udyam_registered: true, enterprise_size: "small", is_trader: false },
      open_matter_count: 0,
      items: [
        {
          invoice_id: "11111111-1111-4111-8111-111111111111",
          invoice_number: "INV-1",
          account_id: "22222222-2222-4222-8222-222222222222",
          account_name: "Orbit Labs",
          amount_outstanding: "1000.00",
          days_overdue: 100,
          follow_ups: MIN_FOLLOW_UPS - 1,
          last_contact_on: null,
          lock: null,
        },
        {
          invoice_id: "33333333-3333-4333-8333-333333333333",
          invoice_number: "INV-2",
          account_id: "22222222-2222-4222-8222-222222222222",
          account_name: "Orbit Labs",
          amount_outstanding: "2000.00",
          days_overdue: 120,
          follow_ups: MIN_FOLLOW_UPS,
          last_contact_on: null,
          lock: null,
        },
      ],
    });
    expect(escalationEligible(parsed.items).map((item) => item.invoice_number)).toEqual(["INV-2"]);
  });
});

describe("nextStepForStage", () => {
  test("names the deadline when the stage is waiting on the client", () => {
    expect(nextStepForStage("awaiting_response", "2026-08-21")).toBe("Response due 21 Aug");
  });

  test("marks a recovered matter closed", () => {
    expect(nextStepForStage("recovered", null)).toBe("Recovered");
    expect(nextStepForStage("closed", null)).toBe("Closed");
  });
});

describe("attachments", () => {
  test("names the file and says what to do", () => {
    expect(attachmentError({ name: "Signed_POD.tiff", size: 1000 })).toBe(
      "Signed_POD.tiff can't be attached. Use PDF, JPG, PNG, DOCX or XLSX.",
    );
    expect(attachmentError({ name: "Scan.pdf", size: 34 * 1024 * 1024 })).toBe(
      "Scan.pdf is 34 MB. Maximum is 25 MB.",
    );
    expect(attachmentError({ name: "POD.JPG", size: 680 * 1024 })).toBeNull();
  });

  test("sizes and badges", () => {
    expect(formatFileSize(348_160)).toBe("340 KB");
    expect(formatFileSize(2_202_009)).toBe("2.1 MB");
    expect(fileBadge("a.pdf")).toBe("PDF");
    expect(fileBadge("a.jpeg")).toBe("IMG");
    expect(fileBadge("a.xlsx")).toBe("XLS");
    expect(fileBadge("a.docx")).toBe("DOC");
  });
});

describe("fixtures parse against the contract", () => {
  test("every response shape", () => {
    expect(eligibleResponseSchema.safeParse(eligibleFixture).success).toBe(true);
    expect(advocatesResponseSchema.safeParse(advocatesFixture).success).toBe(true);
    for (const m of [...mattersFixture, ...advocateMattersFixture]) {
      expect(matterSummarySchema.safeParse(m).success).toBe(true);
    }
    for (const d of [
      ...Object.values(businessMatterDetailsFixture),
      ...Object.values(advocateMatterDetailsFixture),
    ]) {
      expect(matterDetailSchema.safeParse(d).success).toBe(true);
    }
  });

  test("the advocate view adds the brief; the business view never carries one", () => {
    for (const d of Object.values(businessMatterDetailsFixture)) expect(d.brief).toBeNull();
    for (const d of Object.values(advocateMatterDetailsFixture)) {
      expect(d.brief === null).toBe(false);
    }
  });

  test("the mock store gives each side its own thread, so a post lands once per side", () => {
    resetLegalMockStore();
    const store = legalMockStore();
    for (const [id, business] of Object.entries(store.businessDetails)) {
      const advocate = store.advocateDetails[id];
      if (advocate) {
        expect(advocate.thread === business.thread).toBe(false);
        expect(advocate.documents === business.documents).toBe(false);
      }
    }
  });
});

describe("invoice id search param", () => {
  test("round-trips and drops junk", () => {
    const ids = [LEGAL_INVOICE_IDS.inv1876, LEGAL_INVOICE_IDS.inv1733];
    expect(parseInvoiceIds(serialiseInvoiceIds(ids))).toEqual(ids);
    expect(parseInvoiceIds(`${ids[0]},nope,,${ids[0]}`)).toEqual([ids[0]]);
    expect(parseInvoiceIds(undefined)).toEqual([]);
  });
});
