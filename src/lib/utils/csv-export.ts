/**
 * CSV export utilities for invoice data.
 */

export interface ExportableInvoice {
  id: string;
  invoice_number: string;
  account_id: string;
  amount: number;
  issue_date: string;
  due_date: string;
  status: string;
}

/**
 * Escape a field for safe CSV export: quote all fields and escape embedded quotes.
 * Neutralize formula injection by prefixing formula-like content.
 */
function escapeCSVField(value: string | number): string {
  const str = String(value).trim();
  // Neutralize formula injection (=, +, -, @)
  const normalized = /^[=+\-@]/.test(str) ? `'${str}` : str;
  // Escape quotes by doubling them
  const escaped = normalized.replace(/"/g, '""');
  // Quote all fields
  return `"${escaped}"`;
}

/**
 * Convert invoices to CSV format and trigger download.
 * Format: Account ID, Invoice Number, Amount, Issue Date, Due Date, Status
 */
export function exportInvoicesAsCSV(invoices: ExportableInvoice[], filename = "invoices.csv") {
  if (invoices.length === 0) {
    alert("No invoices to export.");
    return;
  }

  // CSV headers
  const headers = ["Account ID", "Invoice Number", "Amount", "Issue Date", "Due Date", "Status"];

  // Convert invoices to CSV rows
  const rows = invoices.map((inv) => [
    escapeCSVField(inv.account_id),
    escapeCSVField(inv.invoice_number),
    escapeCSVField(inv.amount),
    escapeCSVField(inv.issue_date),
    escapeCSVField(inv.due_date),
    escapeCSVField(inv.status),
  ]);

  // Build CSV content
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
