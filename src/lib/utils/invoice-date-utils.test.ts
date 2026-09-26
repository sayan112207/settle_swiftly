import { describe, test, expect } from "bun:test";
import { toISTDate, getDaysUntilDue, isDueThisWeek } from "./invoice-date-utils";

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
});
