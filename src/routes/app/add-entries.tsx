import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/format";
import { parseDelimitedInvoices, type ParsedInvoiceRow } from "@/lib/parsers/invoice-import";
import { invoiceDraftSchema, type InvoiceDraftInput } from "@/lib/schemas/invoices";
import { accountsQueryKeys, getAccounts } from "@/lib/services/accounts";
import { importInvoices, invoicesQueryKeys } from "@/lib/services/invoices";

export const Route = createFileRoute("/app/add-entries")({
  head: () => ({ meta: [{ title: `Add entries — ${PRODUCT_NAME}` }] }),
  component: AddEntriesPage,
});

type Draft = InvoiceDraftInput & { id: string; source: "Manual" | "Import"; errors: string[] };
type Mode = "manual" | "upload" | "paste";
const EMPTY_FORM = {
  account_id: "",
  invoice_number: "",
  amount: "",
  issue_date: "",
  due_date: "",
  external_ref: "",
};

/**
 * Add Entries screen. Lets the user build up a batch of invoice drafts via
 * manual entry, CSV upload, or spreadsheet paste, review/edit/delete them,
 * and save the whole batch in one call once every draft is valid.
 */
function AddEntriesPage() {
  const { orgs } = Route.useRouteContext();
  const orgId = orgs[0]!.id;
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("manual");
  const [form, setForm] = useState(EMPTY_FORM);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const accountsQuery = useQuery({
    queryKey: accountsQueryKeys.list({ sort: "name", dir: "asc" }),
    queryFn: () => getAccounts({ sort: "name", dir: "asc" }),
    retry: false,
  });
  const accounts = accountsQuery.data?.items ?? [];
  const saveMutation = useMutation({
    mutationFn: () =>
      importInvoices({
        data: {
          org_id: orgId,
          invoices: drafts.map(({ id, source, errors, ...invoice }) => invoice),
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSuccessCount(result.created);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoicesQueryKeys.list(orgId) }),
        queryClient.invalidateQueries({ queryKey: accountsQueryKeys.list() }),
      ]);
    },
    onError: () => toast.error("Couldn't save these invoices. Please try again."),
  });
  /** Appends a single validated draft (manual entry) to the draft list and clears any prior success state. */
  function addDraft(input: InvoiceDraftInput & { source: Draft["source"] }) {
    const errors = validateDraft(input, drafts);
    setDrafts((current) => [...current, { ...input, id: crypto.randomUUID(), errors }]);
    setSuccessCount(null);
  }
  /**
   * Handles the manual entry form submit: updates the draft in place when
   * `editingId` is set, otherwise appends a new draft, then resets the form.
   */
  function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...form, source: "Manual" as const };
    if (editingId) {
      setDrafts((current) => {
        const updated = current.map((draft) =>
          draft.id === editingId ? { ...draft, ...input, id: draft.id } : draft,
        );
        return updated.map((draft) => ({
          ...draft,
          errors: validateDraft(
            draft,
            updated.filter((entry) => entry.id !== draft.id),
          ),
        }));
      });
      setEditingId(null);
    } else addDraft(input);
    setForm(EMPTY_FORM);
  }
  /**
   * Appends parsed CSV/paste rows as new import drafts, resolving each
   * row's account name against the org's loaded accounts and validating
   * each resulting draft. Rejects the batch if it would exceed the 500-row
   * limit.
   */
  function addParsedRows(rows: ParsedInvoiceRow[]) {
    if (drafts.length + rows.length > 500) {
      setParseError("This import has more than the 500-row limit.");
      return;
    }
    const names = new Map(
      accounts.map((account) => [normalizeAccount(account.name), account.account_id]),
    );
    setDrafts((current) => [
      ...current,
      ...rows.map((row) => {
        const input = {
          ...row,
          account_id: names.get(normalizeAccount(row.account)) ?? "",
          source: "Import" as const,
        };
        return { ...input, id: crypto.randomUUID(), errors: validateDraft(input, current) };
      }),
    ]);
    setParseError(null);
    setSuccessCount(null);
  }
  /** Parses raw CSV/paste text with the given delimiter and adds the resulting rows as drafts, surfacing any parse error. */
  function parseInput(value: string, delimiter: "," | "\t") {
    try {
      addParsedRows(parseDelimitedInvoices(value, delimiter));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "The file couldn't be parsed.");
    }
  }
  /**
   * Handles the CSV file input's change event: validates the file extension
   * and size, then reads and parses its contents.
   */
  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError(
        "This build supports CSV files. Save an Excel workbook as CSV, then try again.",
      );
      return;
    }
    if (file.size > 5_000_000) {
      setParseError("This file is larger than the 5 MB import limit.");
      return;
    }
    void file.text().then(
      (text) => parseInput(text, ","),
      () => setParseError("The file couldn't be read. Try another CSV file."),
    );
  }
  /**
   * Re-validates every draft against the others, blocks saving if any draft
   * has errors, and otherwise submits the whole batch via `saveMutation`.
   */
  function save() {
    const next = drafts.map((draft, _, all) => ({
      ...draft,
      errors: validateDraft(
        draft,
        all.filter((entry) => entry.id !== draft.id),
      ),
    }));
    setDrafts(next);
    if (next.some((draft) => draft.errors.length > 0)) {
      toast.error("Fix the highlighted entries before saving.");
      return;
    }
    saveMutation.mutate();
  }
  if (successCount !== null)
    return (
      <SuccessState
        count={successCount}
        onMore={() => {
          setDrafts([]);
          setSuccessCount(null);
          setMode("manual");
        }}
      />
    );
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-title font-bold tracking-tight text-fg">Add entries</h1>
        <p className="mt-1 text-prose text-fg-soft">
          Add invoices manually, upload a CSV, or paste a spreadsheet. They remain drafts until
          saved.
        </p>
      </header>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Entry method">
        {(
          [
            ["manual", "Manual entry"],
            ["upload", "Upload file"],
            ["paste", "Paste from Excel"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-pill px-4 py-2 text-body font-semibold ${mode === value ? "bg-accent text-white" : "border border-stroke bg-card text-fg hover:bg-hovered"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {accountsQuery.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <AppSkeleton className="h-10 w-full" />
          <AppSkeleton className="h-10 w-full" />
        </div>
      ) : null}
      {accountsQuery.error ? (
        <p
          role="alert"
          className="rounded-card border border-danger-edge bg-danger-tint p-4 text-body text-danger"
        >
          Couldn't load accounts.{" "}
          <button type="button" className="underline" onClick={() => void accountsQuery.refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      {!accountsQuery.isPending && !accountsQuery.error && mode === "manual" ? (
        <ManualForm
          form={form}
          setForm={setForm}
          accounts={accounts}
          onSubmit={addManual}
          editing={editingId !== null}
        />
      ) : null}
      {!accountsQuery.isPending && !accountsQuery.error && mode === "upload" ? (
        <UploadPanel inputRef={fileInput} onFile={onFile} />
      ) : null}
      {!accountsQuery.isPending && !accountsQuery.error && mode === "paste" ? (
        <PastePanel value={paste} onChange={setPaste} onParse={() => parseInput(paste, "\t")} />
      ) : null}
      {parseError ? (
        <p
          role="alert"
          className="rounded-card border border-danger-edge bg-danger-tint p-4 text-body text-danger"
        >
          {parseError}
        </p>
      ) : null}
      {drafts.length > 0 ? (
        <DraftReview
          drafts={drafts}
          accountNames={new Map(accounts.map((a) => [a.account_id, a.name]))}
          onEdit={(draft) => {
            setForm({
              account_id: draft.account_id,
              invoice_number: draft.invoice_number,
              amount: draft.amount,
              issue_date: draft.issue_date,
              due_date: draft.due_date,
              external_ref: draft.external_ref ?? "",
            });
            setEditingId(draft.id);
            setMode("manual");
          }}
          onDelete={(id) => {
            setDrafts((current) => {
              const remaining = current.filter((draft) => draft.id !== id);
              return remaining.map((draft) => ({
                ...draft,
                errors: validateDraft(
                  draft,
                  remaining.filter((entry) => entry.id !== draft.id),
                ),
              }));
            });
            if (id === editingId) {
              setEditingId(null);
              setForm(EMPTY_FORM);
            }
          }}
          onSave={save}
          saving={saveMutation.isPending}
        />
      ) : null}
    </div>
  );
}

/** Manual invoice entry form: account picker plus invoice fields, used for both adding a new draft and updating one being edited. */
function ManualForm({
  form,
  setForm,
  accounts,
  onSubmit,
  editing,
}: {
  form: typeof EMPTY_FORM;
  setForm: (value: typeof EMPTY_FORM) => void;
  accounts: { account_id: string; name: string }[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  editing: boolean;
}) {
  const update = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <form onSubmit={onSubmit} className="rounded-card border border-hairline bg-card p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Account">
          <select
            required
            value={form.account_id}
            onChange={(e) => update("account_id", e.target.value)}
            className="field"
          >
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.account_id} value={account.account_id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice #">
          <input
            required
            value={form.invoice_number}
            onChange={(e) => update("invoice_number", e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Amount">
          <input
            required
            inputMode="decimal"
            placeholder="₹0.00"
            value={form.amount}
            onChange={(e) => update("amount", e.target.value)}
            className="field tnum"
          />
        </Field>
        <Field label="Invoice date">
          <input
            required
            type="date"
            value={form.issue_date}
            onChange={(e) => update("issue_date", e.target.value)}
            className="field"
          />
        </Field>
        <Field label="Due date">
          <input
            required
            type="date"
            min={form.issue_date || undefined}
            value={form.due_date}
            onChange={(e) => update("due_date", e.target.value)}
            className="field"
          />
        </Field>
        <Field label="PO number (optional)">
          <input
            value={form.external_ref}
            onChange={(e) => update("external_ref", e.target.value)}
            className="field"
          />
        </Field>
      </div>
      <div className="mt-6 flex justify-end">
        <AppButton>
          {editing ? (
            <Pencil className="size-4" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {editing ? "Update draft" : "Add draft"}
        </AppButton>
      </div>
    </form>
  );
}
/** Drop-zone-style panel for choosing a CSV file to import, with the current size/row-count limits shown. */
function UploadPanel({
  inputRef,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <section className="rounded-card border border-dashed border-stroke bg-card p-10 text-center">
      <FileUp className="mx-auto size-8 text-fg-muted" aria-hidden="true" />
      <h2 className="mt-3 text-section font-bold text-fg">Upload a CSV</h2>
      <p className="mt-1 text-prose text-fg-soft">
        Up to 500 rows or 5 MB. Include account, invoice number, amount, invoice date, and due date.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={onFile}
      />
      <AppButton className="mt-4" onClick={() => inputRef.current?.click()}>
        Choose CSV
      </AppButton>
    </section>
  );
}
/** Textarea for pasting tab-separated spreadsheet rows, with a button to preview them as drafts. */
function PastePanel({
  value,
  onChange,
  onParse,
}: {
  value: string;
  onChange: (value: string) => void;
  onParse: () => void;
}) {
  return (
    <section className="rounded-card border border-hairline bg-card p-6">
      <label
        htmlFor="spreadsheet-paste"
        className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
      >
        Paste spreadsheet rows
      </label>
      <textarea
        id="spreadsheet-paste"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Account\tInvoice #\tAmount\tInvoice date\tDue date"
        className="field mt-2 min-h-40"
      />
      <div className="mt-4 flex justify-end">
        <AppButton disabled={!value.trim()} onClick={onParse}>
          Preview entries
        </AppButton>
      </div>
    </section>
  );
}
/**
 * Table of the current draft batch, with per-row edit/delete actions and
 * inline validation errors. The Save button is disabled while any draft has
 * errors.
 */
function DraftReview({
  drafts,
  accountNames,
  onEdit,
  onDelete,
  onSave,
  saving,
}: {
  drafts: Draft[];
  accountNames: Map<string, string>;
  onEdit: (draft: Draft) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const invalid = drafts.filter((draft) => draft.errors.length > 0).length;
  return (
    <section className="rounded-card border border-hairline bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
        <div>
          <h2 className="text-section font-bold text-fg">Review entries</h2>
          <p className="text-prose text-fg-soft">
            {drafts.length} draft {drafts.length === 1 ? "invoice" : "invoices"}
            {invalid ? ` · ${invalid} need attention` : " · ready to save"}
          </p>
        </div>
        <AppButton loading={saving} disabled={invalid > 0} onClick={onSave}>
          Save all
        </AppButton>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              {["Account", "Invoice", "Amount", "Invoice date", "Due date", "Source", ""].map(
                (header, index) => (
                  <th
                    key={`${header}-${index}`}
                    scope="col"
                    className="border-b border-hairline bg-subtle px-3 py-3 text-left text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {drafts.map((draft) => (
              <tr
                key={draft.id}
                className={draft.errors.length ? "bg-danger-tint" : "hover:bg-hovered"}
              >
                <td className="border-b border-hairline px-3 py-3 text-body font-semibold text-fg">
                  {accountNames.get(draft.account_id) ?? "Unmatched account"}
                </td>
                <td className="border-b border-hairline px-3 py-3 text-body text-fg">
                  {draft.invoice_number}
                </td>
                <td className="border-b border-hairline px-3 py-3 text-right text-body tnum">
                  {formatINR(draft.amount)}
                </td>
                <td className="border-b border-hairline px-3 py-3 text-body">{draft.issue_date}</td>
                <td className="border-b border-hairline px-3 py-3 text-body">{draft.due_date}</td>
                <td className="border-b border-hairline px-3 py-3 text-prose text-fg-soft">
                  {draft.source}
                </td>
                <td className="border-b border-hairline px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(draft)}
                    className="rounded-nav p-2 text-fg-soft hover:bg-hovered"
                    aria-label={`Edit ${draft.invoice_number || "draft"}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(draft.id)}
                    className="rounded-nav p-2 text-danger hover:bg-danger-tint"
                    aria-label={`Delete ${draft.invoice_number || "draft"}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                  {draft.errors.length ? (
                    <p role="alert" className="max-w-48 text-prose text-danger">
                      {draft.errors.join(" ")}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
/** Confirmation screen shown after a successful save, with links to view the invoices list or add more entries. */
function SuccessState({ count, onMore }: { count: number; onMore: () => void }) {
  return (
    <div
      className="mx-auto max-w-xl rounded-card border border-accent-edge bg-card p-10 text-center"
      role="status"
    >
      <h1 className="text-title font-bold text-fg">
        {count} {count === 1 ? "invoice" : "invoices"} added
      </h1>
      <p className="mt-2 text-prose text-fg-soft">
        Your invoices were confirmed by the server and are ready to review.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/app/invoices"
          className="rounded-pill bg-accent px-4 py-2 text-body font-semibold text-white hover:bg-accent-hover"
        >
          View invoices
        </Link>
        <AppButton variant="secondary" onClick={onMore}>
          Add more
        </AppButton>
      </div>
    </div>
  );
}
/** Labeled form field wrapper, used by `ManualForm` for each input/select. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
/** Lowercases, trims, and collapses whitespace in an account name so imported names can be matched against loaded accounts regardless of casing/spacing. */
function normalizeAccount(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
/** Builds the key used to detect duplicate drafts: the account id plus the invoice number normalized for whitespace, punctuation, and case. */
function invoiceKey(input: Pick<InvoiceDraftInput, "account_id" | "invoice_number">) {
  return `${input.account_id}:${input.invoice_number
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\W+|\W+$/g, "")
    .toUpperCase()}`;
}
/**
 * Validates a single draft against `invoiceDraftSchema` and checks it for a
 * duplicate invoice number against the other given drafts. Returns the
 * combined, deduplicated list of error messages (empty when the draft is
 * valid).
 */
function validateDraft(
  input: InvoiceDraftInput,
  drafts: readonly Pick<Draft, "account_id" | "invoice_number">[],
): string[] {
  const parsed = invoiceDraftSchema.safeParse(input);
  const errors = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  const key = invoiceKey(input);
  if (input.account_id && input.invoice_number && drafts.some((draft) => invoiceKey(draft) === key))
    errors.push("Duplicate invoice number in this import.");
  return [...new Set(errors)];
}
