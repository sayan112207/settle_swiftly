import { describe, expect, test } from "bun:test";
import { getBalance } from "./useAllocationState";

describe("useAllocationState - getBalance", () => {
  describe("exact allocation", () => {
    test("allocates exactly to received amount", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "1000.00",
          selected: true,
        },
      ];

      const balance = getBalance("1000.00", rows, "None", 0);

      expect(balance.allocated).toBe("1000.00");
      expect(balance.remaining).toBe("0.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });

  describe("under-allocation", () => {
    test("shows amount left when allocated less than received", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "600.00",
          selected: true,
        },
      ];

      const balance = getBalance("1000.00", rows, "None", 0);

      expect(balance.allocated).toBe("600.00");
      expect(balance.remaining).toBe("400.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });

  describe("over-allocation", () => {
    test("detects when allocated exceeds received", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "2000.00",
          allocated: "1500.00",
          selected: true,
        },
      ];

      const balance = getBalance("1000.00", rows, "None", 0);

      expect(balance.allocated).toBe("1500.00");
      expect(balance.isOverAllocated).toBe(true);
    });
  });

  describe("multiple invoices", () => {
    test("sums allocation across all invoices", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "500.00",
          selected: true,
        },
        {
          invoiceId: "inv-2",
          invoiceNumber: "INV-002",
          outstandingBalance: "1000.00",
          allocated: "300.00",
          selected: true,
        },
        {
          invoiceId: "inv-3",
          invoiceNumber: "INV-003",
          outstandingBalance: "1000.00",
          allocated: "200.00",
          selected: true,
        },
      ];

      const balance = getBalance("1000.00", rows, "None", 0);

      expect(balance.allocated).toBe("1000.00");
      expect(balance.remaining).toBe("0.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });

  describe("TDS - None", () => {
    test("does not reduce effective amount when TDS is None", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "800.00",
          selected: true,
        },
      ];

      const balance = getBalance("1000.00", rows, "None", 0);

      expect(balance.remaining).toBe("200.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });

  describe("TDS - with percentage", () => {
    test("reduces effective amount by TDS percentage", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "900.00",
          selected: true,
        },
      ];

      // 1000 with 10% TDS = 900 effective, allocated 900 = 0 remaining
      const balance = getBalance("1000.00", rows, "194C", 10);

      expect(balance.allocated).toBe("900.00");
      expect(balance.remaining).toBe("0.00");
      expect(balance.isOverAllocated).toBe(false);
    });

    test("detects over-allocation when accounting for TDS", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "950.00",
          selected: true,
        },
      ];

      // 1000 with 10% TDS = 900 effective, allocated 950 > 900 = over-allocated
      const balance = getBalance("1000.00", rows, "194C", 10);

      expect(balance.isOverAllocated).toBe(true);
    });

    test("handles high TDS percentage", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "500.00",
          allocated: "400.00",
          selected: true,
        },
      ];

      // 1000 with 60% TDS = 400 effective, allocated 400 = 0 remaining
      const balance = getBalance("1000.00", rows, "194J", 60);

      expect(balance.allocated).toBe("400.00");
      expect(balance.remaining).toBe("0.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });

  describe("zero allocations", () => {
    test("shows full amount as remaining when nothing allocated", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "0.00",
          selected: false,
        },
      ];

      const balance = getBalance("1000.00", rows, "None", 0);

      expect(balance.allocated).toBe("0.00");
      expect(balance.remaining).toBe("1000.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });

  describe("decimal precision", () => {
    test("handles paise correctly", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1234.56",
          allocated: "789.12",
          selected: true,
        },
      ];

      const balance = getBalance("1234.56", rows, "None", 0);

      expect(balance.allocated).toBe("789.12");
      expect(balance.remaining).toBe("445.44");
      expect(balance.isOverAllocated).toBe(false);
    });

    test("handles TDS with decimal precision", () => {
      const rows = [
        {
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          outstandingBalance: "1000.00",
          allocated: "931.00",
          selected: true,
        },
      ];

      // 1000 with 6.9% TDS = 931 effective
      const balance = getBalance("1000.00", rows, "194H", 6.9);

      // 1000 * 6.9 / 100 = 69, so effective = 931
      expect(balance.remaining).toBe("0.00");
      expect(balance.isOverAllocated).toBe(false);
    });
  });
});
