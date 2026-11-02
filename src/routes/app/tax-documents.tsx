import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { DataTable, type Column } from "@/components/app/DataTable";
import { QueryNotice } from "@/components/app/QueryNotice";
import { TonePill, type PillTone } from "@/components/app/TonePill";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatShortDate } from "@/lib/format";
import type { TaxDocument, TaxDocumentState } from "@/lib/schemas/commercial-terms";
import {
  commercialTermsQueryKeys,
  getTaxDocuments,
  markTaxDocumentsExported,
} from "@/lib/services/commercial-terms";
import { taxDocumentsToCsv } from "@/lib/services/commercial-terms-rules";
import { featureErrorMessage } from "@/lib/services/feature-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/tax-documents")({
  head: () => ({ meta: [{ title: `Tax documents — ${PRODUCT_NAME}` }] }),
  component: TaxDocumentsPage,
});

const STATE_LABEL: Record<TaxDocumentState, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  exported: { label: "Exported", tone: "green" },
  posted: { label: "Posted", tone: "green" },
  void: { label: "Void", tone: "neutral" },
};

/** A money cell: credit notes are negative and read in danger ink. */
function Money({ value }: { value: string }) {
  return (
    <span className={cn("tnum", value.trim().startsWith("-") ? "text-danger" : "text-fg")}>
      {formatINR(value)}
    </span>
  );
}

const COLUMNS: Column<TaxDocument>[] = [
  {
    id: "number",
    header: "Document",
    cell: (row) => (
      <span className={cn(row.state === "void" && "text-fg-muted line-through")}>{row.number}</span>
    ),
  },
  { id: "invoice", header: "Invoice", text: (row) => row.invoice_number },
  { id: "account", header: "Account", text: (row) => row.account_name, truncateAt: "xs" },
  {
    id: "taxable",
    header: "Taxable",
    align: "right",
    cell: (row) => <Money value={row.taxable} />,
  },
  { id: "gst", header: "GST", align: "right", cell: (row) => <Money value={row.gst} /> },
  { id: "total", header: "Total", align: "right", cell: (row) => <Money value={row.total} /> },
  { id: "reason", header: "Reason", text: (row) => row.reason, wrap: true },
  { id: "date", header: "Date", text: (row) => formatShortDate(row.created_on) },
  {
    id: "state",
    header: "State",
    cell: (row) => (
      <TonePill tone={STATE_LABEL[row.state].tone}>{STATE_LABEL[row.state].label}</TonePill>
    ),
  },
];

/**
 * Hands the documents to the browser as a CSV download. The BOM is for Excel,
 * which otherwise reads UTF-8 as Windows-1252.
 */
function downloadCsv(documents: readonly TaxDocument[]): void {
  try {
    const blob = new Blob(["﻿", taxDocumentsToCsv(documents)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tax-documents.csv";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (error) {
    console.error(error);
    toast("Couldn't download the documents.");
  }
}

/**
 * Credit and debit notes generated from offers and interest claims, waiting to
 * be posted in Tally or Zoho. Settle Swiftly drafts them; it does not post them.
 */
function TaxDocumentsPage() {
  const queryClient = useQueryClient();
  const docsQuery = useQuery({
    queryKey: commercialTermsQueryKeys.taxDocuments,
    queryFn: () => getTaxDocuments(),
    retry: false,
  });
  const documents = docsQuery.data ?? [];
  const drafts = documents.filter((doc) => doc.state === "draft");

  const exportMutation = useMutation({
    mutationFn: () => markTaxDocumentsExported(drafts.map((doc) => doc.document_id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: commercialTermsQueryKeys.taxDocuments });
      toast(
        `${drafts.length} ${drafts.length === 1 ? "document" : "documents"} marked as exported`,
      );
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't mark them as exported.")),
  });

  return (
    <div className="space-y-6" aria-busy={docsQuery.isPending || undefined}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-title font-bold tracking-tight text-fg">Tax documents</h1>
          <p className="mt-1 text-prose text-fg-soft">
            Credit and debit notes generated from offers and interest claims. Post these in Tally or
            Zoho — {PRODUCT_NAME} drafts them, it does not post them for you.
          </p>
        </div>
        {documents.length > 0 ? (
          <div className="flex gap-2">
            <AppButton variant="secondary" onClick={() => downloadCsv(documents)}>
              Download CSV
            </AppButton>
            <AppButton
              disabled={drafts.length === 0}
              loading={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              {drafts.length === 0 ? "Nothing to export" : `Mark ${drafts.length} as exported`}
            </AppButton>
          </div>
        ) : null}
      </header>

      {docsQuery.isPending ? (
        <div className="space-y-2">
          <AppSkeleton className="h-10 w-full" />
          <AppSkeleton className="h-10 w-full" />
          <AppSkeleton className="h-10 w-full" />
        </div>
      ) : docsQuery.isError ? (
        <QueryNotice
          error={docsQuery.error}
          fallback="Couldn't load tax documents."
          onRetry={() => void docsQuery.refetch()}
        />
      ) : documents.length === 0 ? (
        <div className="rounded-card border border-hairline bg-card px-5 py-12 text-center">
          <p className="text-section font-bold tracking-tight text-fg">No tax documents yet.</p>
          <p className="mt-1 text-prose text-fg-soft">
            They appear here when a discount, settlement or interest claim is accepted.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-hairline bg-card">
            <DataTable columns={COLUMNS} rows={documents} rowKey={(row) => row.document_id} />
          </div>
          <p className="text-prose text-fg-muted">
            GST on a late payment interest claim is charged at the rate of the underlying supply —
            18% here. Confirm the treatment with your accountant before posting.
          </p>
        </>
      )}
    </div>
  );
}
