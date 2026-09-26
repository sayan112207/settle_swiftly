import { useState, useCallback } from "react";

export interface AllocationRow {
  invoiceId: string;
  invoiceNumber: string;
  outstandingBalance: string;
  allocated: string;
  selected: boolean;
}

export interface AllocationState {
  rows: AllocationRow[];
  tdsSection: "None" | "194C" | "194J" | "194H" | "Custom";
  tdsPercentage: number;
  receivedAmount: string;
}

export interface AllocationBalance {
  allocated: string;
  remaining: string;
  isOverAllocated: boolean;
  allocatedCents: bigint;
  receivedCents: bigint;
}

function moneyToCents(value: string): bigint {
  const [rupees, paise = "0"] = value.split(".");
  return BigInt(rupees ?? "0") * 100n + BigInt(paise.padEnd(2, "0").slice(0, 2));
}

function centsToMoney(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const rupees = abs / 100n;
  const paise = abs % 100n;
  return `${sign}${rupees}.${paise.toString().padStart(2, "0")}`;
}

export function useAllocationState(
  receivedAmount: string,
  initialAllocations?: Array<{ invoiceId: string; invoiceNumber: string; amount: string }>,
) {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [tdsSection, setTdsSection] = useState<AllocationState["tdsSection"]>("None");
  const [tdsPercentage, setTdsPercentage] = useState(0);

  const setInvoices = useCallback(
    (
      invoices: Array<{
        invoiceId: string;
        invoiceNumber: string;
        outstandingBalance: string;
      }>,
    ) => {
      const rowMap = new Map<string, AllocationRow>();

      // Initialize from existing allocations if provided
      if (initialAllocations) {
        for (const alloc of initialAllocations) {
          rowMap.set(alloc.invoiceId, {
            invoiceId: alloc.invoiceId,
            invoiceNumber: alloc.invoiceNumber,
            outstandingBalance:
              invoices.find((i) => i.invoiceId === alloc.invoiceId)?.outstandingBalance ?? "0.00",
            allocated: alloc.amount,
            selected: true,
          });
        }
      }

      // Add remaining invoices
      for (const invoice of invoices) {
        if (!rowMap.has(invoice.invoiceId)) {
          rowMap.set(invoice.invoiceId, {
            invoiceId: invoice.invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            outstandingBalance: invoice.outstandingBalance,
            allocated: "0.00",
            selected: false,
          });
        }
      }

      setRows(Array.from(rowMap.values()));
    },
    [initialAllocations],
  );

  const toggleInvoice = useCallback((invoiceId: string) => {
    setRows((prev) =>
      prev.map((row) =>
        row.invoiceId === invoiceId
          ? {
              ...row,
              selected: !row.selected,
              allocated: !row.selected ? row.outstandingBalance : "0.00",
            }
          : row,
      ),
    );
  }, []);

  const setAllocationAmount = useCallback(
    (invoiceId: string, amount: string) => {
      const amountCents = moneyToCents(amount);
      const maxCents = moneyToCents(
        rows.find((r) => r.invoiceId === invoiceId)?.outstandingBalance ?? "0.00",
      );

      // Allow negative to detect over-allocation, but don't enforce max here
      // The UI will show over-allocation state
      if (amountCents < 0n) return;

      setRows((prev) =>
        prev.map((row) =>
          row.invoiceId === invoiceId
            ? {
                ...row,
                allocated: amount,
                selected: amountCents > 0n,
              }
            : row,
        ),
      );
    },
    [rows],
  );

  const autoFillOldestFirst = useCallback(
    (invoicesByAge: Array<{ invoiceId: string; outstandingBalance: string }>) => {
      let remainingCents = moneyToCents(receivedAmount);
      const ageMap = new Map(invoicesByAge.map((inv, idx) => [inv.invoiceId, idx]));

      // Create allocation amounts by processing invoices in age order
      const allocationByInvoiceId = new Map<string, string>();
      const selectedByInvoiceId = new Map<string, boolean>();

      // Process invoices in age order
      const invoicesInOrder = [...invoicesByAge].sort(
        (a, b) => (ageMap.get(a.invoiceId) ?? 999) - (ageMap.get(b.invoiceId) ?? 999),
      );

      for (const invoice of invoicesInOrder) {
        if (remainingCents <= 0n) break;

        const balanceCents = moneyToCents(invoice.outstandingBalance);
        const allocateCents = remainingCents < balanceCents ? remainingCents : balanceCents;

        allocationByInvoiceId.set(invoice.invoiceId, centsToMoney(allocateCents));
        selectedByInvoiceId.set(invoice.invoiceId, allocateCents > 0n);
        remainingCents -= allocateCents;
      }

      // Update rows preserving original order
      const newRows = rows.map((row) => ({
        ...row,
        allocated: allocationByInvoiceId.get(row.invoiceId) ?? row.allocated,
        selected: selectedByInvoiceId.get(row.invoiceId) ?? row.selected,
      }));

      setRows(newRows);
    },
    [receivedAmount, rows],
  );

  const balance = getBalance(receivedAmount, rows, tdsSection, tdsPercentage);

  return {
    rows,
    setInvoices,
    toggleInvoice,
    setAllocationAmount,
    autoFillOldestFirst,
    tdsSection,
    setTdsSection,
    tdsPercentage,
    setTdsPercentage,
    balance,
    state: {
      rows,
      tdsSection,
      tdsPercentage,
      receivedAmount,
    } as AllocationState,
  };
}

export function getBalance(
  receivedAmount: string,
  rows: AllocationRow[],
  tdsSection: string,
  tdsPercentage: number,
): AllocationBalance {
  const receivedCents = moneyToCents(receivedAmount);
  let allocatedCents = 0n;

  for (const row of rows) {
    allocatedCents += moneyToCents(row.allocated);
  }

  // If TDS is applied, reduce the effective received amount
  let effectiveReceivedCents = receivedCents;
  if (tdsSection !== "None" && tdsPercentage > 0) {
    // Convert decimal percentage to basis points (0-10000) to handle decimals
    const basisPoints = Math.round(tdsPercentage * 100);
    const tdsCents = (receivedCents * BigInt(basisPoints)) / 10000n;
    effectiveReceivedCents = receivedCents - tdsCents;
  }

  const remainingCents = effectiveReceivedCents - allocatedCents;

  return {
    allocated: centsToMoney(allocatedCents),
    remaining: centsToMoney(remainingCents),
    isOverAllocated: allocatedCents > effectiveReceivedCents,
    allocatedCents,
    receivedCents: effectiveReceivedCents,
  };
}
