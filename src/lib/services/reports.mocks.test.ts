import { describe, expect, test } from "bun:test";

import { weeklyReportSchema } from "@/lib/schemas/reports";
import { summaryFixture } from "@/lib/services/dashboard.mocks";
import { agedDebtSummary } from "@/lib/services/reports-rules";
import {
  noAgedDebtReportFixture,
  pendingReportFixture,
  weeklyReportFixture,
} from "@/lib/services/reports.mocks";

describe("weekly report fixtures", () => {
  test("every fixture parses against the contract", () => {
    for (const fixture of [weeklyReportFixture, pendingReportFixture, noAgedDebtReportFixture]) {
      expect(weeklyReportSchema.safeParse(fixture).success).toBe(true);
    }
  });

  test("aged debt equals the dashboard's 90+ bucket", () => {
    if (!weeklyReportFixture.has_report) throw new Error("fixture must be a ready report");
    const ninetyPlus = summaryFixture.aging.find((segment) => segment.bucket === "90+");
    expect(agedDebtSummary(weeklyReportFixture.aged_debt).total).toBe(ninetyPlus?.amount ?? "");
  });

  test("the contract rejects an aged-debt row under 90 days", () => {
    if (!weeklyReportFixture.has_report) throw new Error("fixture must be a ready report");
    const [first] = weeklyReportFixture.aged_debt;
    if (first === undefined) throw new Error("fixture must have aged debt");
    const young = {
      ...weeklyReportFixture,
      aged_debt: [{ ...first, days_overdue: 74 }],
    };
    expect(weeklyReportSchema.safeParse(young).success).toBe(false);
  });

  test("aged debt is ordered largest first", () => {
    if (!weeklyReportFixture.has_report) throw new Error("fixture must be a ready report");
    const amounts = weeklyReportFixture.aged_debt.map((row) => Number(row.amount_outstanding));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
  });
});
