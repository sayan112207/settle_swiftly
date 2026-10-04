import { describe, expect, test } from "bun:test";

import type { AgedDebtItem, ReadyWeeklyReport } from "@/lib/schemas/reports";
import {
  agedDebtSummary,
  chaseOutcomeMessage,
  collectedDirection,
  csvField,
  dsoChartWindow,
  dsoBarHeights,
  dsoTrend,
  formatMonthLong,
  formatMonthShort,
  reportFileName,
  reportToCsv,
} from "@/lib/services/reports-rules";
import { weeklyReportFixture } from "@/lib/services/reports.mocks";

function ready(): ReadyWeeklyReport {
  if (!weeklyReportFixture.has_report) throw new Error("fixture must be a ready report");
  return weeklyReportFixture;
}

function aged(account_id: string, amount_outstanding: string): AgedDebtItem {
  return {
    invoice_id: "d0c00099-0000-4000-8000-000000000001",
    account_id,
    account_name: "Test",
    invoice_number: "INV-1",
    amount_outstanding,
    days_overdue: 95,
    chase_disabled_reason: null,
  };
}

describe("formatMonth*", () => {
  test("reads the month from the string, not through Date", () => {
    expect(formatMonthShort("2026-03")).toBe("Mar");
    expect(formatMonthLong("2026-03")).toBe("March");
    expect(formatMonthShort("2026-12")).toBe("Dec");
  });
});

describe("agedDebtSummary", () => {
  test("sums in paise so decimals do not drift", () => {
    const rows = [aged("a", "0.10"), aged("b", "0.20"), aged("c", "100000.05")];
    expect(agedDebtSummary(rows).total).toBe("100000.35");
  });

  test("counts distinct accounts, not invoices", () => {
    const rows = [aged("a", "10.00"), aged("a", "20.00"), aged("b", "5.00")];
    expect(agedDebtSummary(rows).accountCount).toBe(2);
  });

  test("an empty list is zero across zero accounts", () => {
    expect(agedDebtSummary([])).toEqual({ total: "0.00", accountCount: 0 });
  });
});

describe("dsoTrend", () => {
  test("a fall in DSO is good news", () => {
    expect(dsoTrend(ready().dso_series)).toEqual({
      label: "↓ 9 days since March",
      tone: "good",
    });
  });

  test("a rise in DSO is bad news", () => {
    const trend = dsoTrend([
      { month: "2026-07", days: 30 },
      { month: "2026-08", days: 31 },
    ]);
    expect(trend).toEqual({ label: "↑ 1 day since July", tone: "bad" });
  });

  test("flat and single-point series are neutral", () => {
    expect(
      dsoTrend([
        { month: "2026-07", days: 30 },
        { month: "2026-08", days: 30 },
      ]).tone,
    ).toBe("neutral");
    expect(dsoTrend([{ month: "2026-08", days: 30 }]).label).toBe("Not enough history yet");
  });
});

describe("dsoBarHeights", () => {
  test("scales between the series' own min and max", () => {
    const heights = dsoBarHeights(ready().dso_series);
    expect(heights[0]).toBe(84);
    expect(heights[heights.length - 1]).toBe(24);
  });

  test("a flat series does not divide by zero", () => {
    expect(
      dsoBarHeights([
        { month: "2026-07", days: 30 },
        { month: "2026-08", days: 30 },
      ]),
    ).toEqual([24, 24]);
  });
});

describe("collectedDirection", () => {
  test("compares in paise", () => {
    expect(collectedDirection("100.01", "100.00")).toBe("up from");
    expect(collectedDirection("99.99", "100.00")).toBe("down from");
    expect(collectedDirection("100.00", "100")).toBe("same as");
    expect(collectedDirection("0.00", "0.00")).toBe("same as");
  });
});

describe("chaseOutcomeMessage", () => {
  test("reports a queued chase", () => {
    expect(chaseOutcomeMessage({ queued: 1, skipped: [] }, "INV-1")).toBe("INV-1 queued");
  });

  test("reports the server's skip reason verbatim", () => {
    const result = {
      queued: 0,
      skipped: [{ invoice_id: "d0c00099-0000-4000-8000-000000000001", reason: "Paid" }],
    };
    expect(chaseOutcomeMessage(result, "INV-1")).toBe("Skipped INV-1 (Paid).");
  });

  test("does not claim success when nothing was queued", () => {
    expect(chaseOutcomeMessage({ queued: 0, skipped: [] }, "INV-1")).toBe(
      "INV-1 wasn't queued. Try again in a moment.",
    );
  });
});

describe("dsoChartWindow", () => {
  test("keeps at most the last twelve months", () => {
    const series = Array.from({ length: 18 }, (_, i) => ({
      month: `2025-${String((i % 12) + 1).padStart(2, "0")}`,
      days: i,
    }));
    const window = dsoChartWindow(series);
    expect(window).toHaveLength(12);
    expect(window[0]?.days).toBe(6);
  });

  test("an empty series draws no bars", () => {
    expect(dsoBarHeights([])).toEqual([]);
  });
});

describe("csvField", () => {
  test("quotes commas, quotes and newlines", () => {
    expect(csvField("Anand & Sons, Traders")).toBe('"Anand & Sons, Traders"');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });

  test("neutralises formula injection but keeps negative numbers", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("-50000.00")).toBe("-50000.00");
    expect(csvField(38)).toBe("38");
  });
});

describe("reportToCsv", () => {
  test("writes every section with plain decimal amounts", () => {
    const csv = reportToCsv(ready());
    expect(csv.includes("At risk next week\r\n")).toBe(true);
    expect(
      csv.includes("Anand & Sons Traders,INV-1187,95000.00,1–30,Second reminder due Wednesday"),
    ).toBe(true);
    expect(csv.includes("Vertex Labs Pvt Ltd,INV-2103,110000.00,96")).toBe(true);
    expect(csv.includes("₹")).toBe(false);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  test("names the file after the report's own day", () => {
    expect(reportFileName(ready())).toBe("weekly-report-2026-08-17.csv");
  });
});
