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
 * Convert invoices to CSV format and trigger download.
 * Format: Account ID, Invoice Number, Amount, Issue Date, Due Date, Status
 */
export function exportInvoicesAsCSV(invoices: ExportableInvoice[], filename = "invoices.csv") {
  if (invoices.length === 0) {
    alert("No invoices to export.");
    return;
  }

  // CSV headers
  const headers = ["Invoice Number", "Amount", "Issue Date", "Due Date", "Status"];

  // Convert invoices to CSV rows
  const rows = invoices.map((inv) => [
    `"${inv.invoice_number}"`,
    inv.amount.toString(),
    inv.issue_date,
    inv.due_date,
    inv.status,
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
