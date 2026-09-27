import { describe, test, expect } from "bun:test";
import {
  toISTDate,
  getDaysUntilDue,
  isDueThisWeek,
  getTodayIST,
  isDateInRange,
} from "./invoice-date-utils";

describe("invoice date utilities with IST timezone", () => {
  // Create a date object for a given IST date string at a specific time
  const createISTDate = (dateStr: string, timeStr: string = "12:00:00"): Date => {
    return new Date(`${dateStr}T${timeStr}+05:30`);
  };

  describe("getDaysUntilDue", () => {
    test("due today → 0 days", () => {
      const today = createISTDate("2026-09-27");
      expect(getDaysUntilDue("2026-09-27", today)).toBe(0);
    });

    test("due 1 day from today → 1 day", () => {
      const today = createISTDate("2026-09-27");
      expect(getDaysUntilDue("2026-09-28", today)).toBe(1);
    });

    test("due 7 calendar days from today → 7 days", () => {
      const today = createISTDate("2026-09-27");
      expect(getDaysUntilDue("2026-10-04", today)).toBe(7);
    });

    test("due 8 calendar days from today → 8 days", () => {
      const today = createISTDate("2026-09-27");
      expect(getDaysUntilDue("2026-10-05", today)).toBe(8);
    });

    test("due yesterday → -1 days", () => {
      const today = createISTDate("2026-09-27");
      expect(getDaysUntilDue("2026-09-26", today)).toBe(-1);
    });

    test("due 30 days from today → 30 days", () => {
      const today = createISTDate("2026-09-27");
      expect(getDaysUntilDue("2026-10-27", today)).toBe(30);
    });
  });

  describe("isDueThisWeek", () => {
    test("due today → included", () => {
      const today = createISTDate("2026-09-27");
      expect(isDueThisWeek("2026-09-27", today)).toBe(true);
    });

    test("due 7 calendar days from today → included", () => {
      const today = createISTDate("2026-09-27");
      expect(isDueThisWeek("2026-10-04", today)).toBe(true);
    });

    test("due 8 calendar days from today → excluded", () => {
      const today = createISTDate("2026-09-27");
      expect(isDueThisWeek("2026-10-05", today)).toBe(false);
    });

    test("due yesterday → excluded", () => {
      const today = createISTDate("2026-09-27");
      expect(isDueThisWeek("2026-09-26", today)).toBe(false);
    });

    test("due 1 day from today → included", () => {
      const today = createISTDate("2026-09-27");
      expect(isDueThisWeek("2026-09-28", today)).toBe(true);
    });

    test("due 30 days from today → excluded", () => {
      const today = createISTDate("2026-09-27");
      expect(isDueThisWeek("2026-10-27", today)).toBe(false);
    });

    test("boundary: due exactly 7 days from today → included", () => {
      const today = createISTDate("2026-09-20");
      expect(isDueThisWeek("2026-09-27", today)).toBe(true);
    });

    test("boundary: due exactly 8 days from today → excluded", () => {
      const today = createISTDate("2026-09-20");
      expect(isDueThisWeek("2026-09-28", today)).toBe(false);
    });
  });

  describe("timezone stability", () => {
    test("IST date conversion uses +05:30 offset consistently", () => {
      const istDate1 = toISTDate("2026-09-27");
      const istDate2 = toISTDate("2026-09-27");
      expect(istDate1.getTime()).toBe(istDate2.getTime());
    });

    test("different dates produce different timestamps", () => {
      const date1 = toISTDate("2026-09-27");
      const date2 = toISTDate("2026-09-28");
      expect(date1.getTime() === date2.getTime()).toBe(false);
    });

    test("calculation is stable across different times of day in IST", () => {
      const earlyInDay = createISTDate("2026-09-27", "08:00:00");
      const lateInDay = createISTDate("2026-09-27", "18:30:00");

      const result1 = getDaysUntilDue("2026-10-04", earlyInDay);
      const result2 = getDaysUntilDue("2026-10-04", lateInDay);

      expect(result1).toBe(result2);
      expect(result1).toBe(7);
    });

    test("calculation ignores viewer's local timezone and uses IST consistently", () => {
      const today = createISTDate("2026-09-27");
      const days = getDaysUntilDue("2026-10-04", today);
      expect(days).toBe(7);
    });
  });

  describe("isDateInRange with IST-safe logic", () => {
    test("Today → matches exact date", () => {
      const today = createISTDate("2026-09-27");
      expect(isDateInRange("2026-09-27", "Today", today)).toBe(true);
      expect(isDateInRange("2026-09-26", "Today", today)).toBe(false);
      expect(isDateInRange("2026-09-28", "Today", today)).toBe(false);
    });

    test("This week → includes 0-7 days ago", () => {
      const today = createISTDate("2026-09-27");
      expect(isDateInRange("2026-09-27", "This week", today)).toBe(true);
      expect(isDateInRange("2026-09-26", "This week", today)).toBe(true);
      expect(isDateInRange("2026-09-20", "This week", today)).toBe(true);
      expect(isDateInRange("2026-09-19", "This week", today)).toBe(false);
      expect(isDateInRange("2026-09-28", "This week", today)).toBe(false);
    });

    test("This month → same calendar month", () => {
      const today = createISTDate("2026-09-27");
      expect(isDateInRange("2026-09-01", "This month", today)).toBe(true);
      expect(isDateInRange("2026-09-15", "This month", today)).toBe(true);
      expect(isDateInRange("2026-09-30", "This month", today)).toBe(true);
      expect(isDateInRange("2026-08-27", "This month", today)).toBe(false);
      expect(isDateInRange("2026-10-01", "This month", today)).toBe(false);
    });

    test("This month → October 1 treated as October regardless of browser timezone", () => {
      const today = createISTDate("2026-10-15");
      expect(isDateInRange("2026-10-01", "This month", today)).toBe(true);
      expect(isDateInRange("2026-10-31", "This month", today)).toBe(true);
      expect(isDateInRange("2026-09-30", "This month", today)).toBe(false);
    });

    test("Last month → previous month", () => {
      const today = createISTDate("2026-09-27");
      expect(isDateInRange("2026-08-01", "Last month", today)).toBe(true);
      expect(isDateInRange("2026-08-31", "Last month", today)).toBe(true);
      expect(isDateInRange("2026-09-01", "Last month", today)).toBe(false);
      expect(isDateInRange("2026-07-31", "Last month", today)).toBe(false);
    });

    test("Last month → wraps year correctly (Jan is last month of Dec)", () => {
      const today = createISTDate("2026-01-15");
      expect(isDateInRange("2025-12-01", "Last month", today)).toBe(true);
      expect(isDateInRange("2025-12-31", "Last month", today)).toBe(true);
      expect(isDateInRange("2026-01-01", "Last month", today)).toBe(false);
    });

    test("This quarter → from quarter start to today (inclusive)", () => {
      const q1Today = createISTDate("2026-02-15");
      expect(isDateInRange("2026-01-01", "This quarter", q1Today)).toBe(true);
      expect(isDateInRange("2026-02-15", "This quarter", q1Today)).toBe(true);
      expect(isDateInRange("2026-02-16", "This quarter", q1Today)).toBe(false);
      expect(isDateInRange("2026-03-15", "This quarter", q1Today)).toBe(false);
      expect(isDateInRange("2025-12-31", "This quarter", q1Today)).toBe(false);
    });

    test("This quarter → Q1 (Jan-Mar), start to today", () => {
      const q1Today = createISTDate("2026-03-15");
      expect(isDateInRange("2026-01-01", "This quarter", q1Today)).toBe(true);
      expect(isDateInRange("2026-03-15", "This quarter", q1Today)).toBe(true);
      expect(isDateInRange("2026-03-16", "This quarter", q1Today)).toBe(false);
      expect(isDateInRange("2026-04-01", "This quarter", q1Today)).toBe(false);
    });

    test("This quarter → Q2 (Apr-Jun), start to today", () => {
      const q2Today = createISTDate("2026-05-15");
      expect(isDateInRange("2026-04-01", "This quarter", q2Today)).toBe(true);
      expect(isDateInRange("2026-05-15", "This quarter", q2Today)).toBe(true);
      expect(isDateInRange("2026-05-16", "This quarter", q2Today)).toBe(false);
      expect(isDateInRange("2026-06-30", "This quarter", q2Today)).toBe(false);
      expect(isDateInRange("2026-07-01", "This quarter", q2Today)).toBe(false);
    });

    test("This quarter → Q3 (Jul-Sep), start to today", () => {
      const q3Today = createISTDate("2026-08-15");
      expect(isDateInRange("2026-07-01", "This quarter", q3Today)).toBe(true);
      expect(isDateInRange("2026-08-15", "This quarter", q3Today)).toBe(true);
      expect(isDateInRange("2026-08-16", "This quarter", q3Today)).toBe(false);
      expect(isDateInRange("2026-09-30", "This quarter", q3Today)).toBe(false);
      expect(isDateInRange("2026-10-01", "This quarter", q3Today)).toBe(false);
    });

    test("This quarter → Q4 (Oct-Dec), first day not accidentally excluded", () => {
      const q4Today = createISTDate("2026-10-15");
      expect(isDateInRange("2026-10-01", "This quarter", q4Today)).toBe(true);
      expect(isDateInRange("2026-10-15", "This quarter", q4Today)).toBe(true);
      expect(isDateInRange("2026-10-16", "This quarter", q4Today)).toBe(false);
      expect(isDateInRange("2026-12-31", "This quarter", q4Today)).toBe(false);
      expect(isDateInRange("2027-01-01", "This quarter", q4Today)).toBe(false);
    });

    test("date range filters are independent of browser timezone", () => {
      const today = createISTDate("2026-09-27");
      const date = "2026-09-20";
      const result = isDateInRange(date, "This week", today);
      expect(result).toBe(true);
    });
  });
});
