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
import {
  addEntriesSearchSchema,
  invoiceDraftPendingAccountSchema,
  invoiceDraftSchema,
  type AddEntriesSearch,
} from "@/lib/schemas/invoices";
import { accountsQueryKeys, ensureAccounts, getAccounts } from "@/lib/services/accounts";
import { importInvoices, invoicesQueryKeys } from "@/lib/services/invoices";

export const Route = createFileRoute("/app/add-entries")({
  validateSearch: addEntriesSearchSchema,
  head: () => ({ meta: [{ title: `Add entries — ${PRODUCT_NAME}` }] }),
  component: AddEntriesPage,
});

/**
 * One invoice waiting to be saved.
 *
 * `account_id` is empty while the account does not exist yet — the import
 * named a customer this org has never billed, or the manual form is adding one
 * inline. Such a draft is not an error; it is resolved to a real id by
 * `ensureAccounts` in the same click that saves the batch. `account_name` is
 * what the row displays either way.
 */
type Draft = {
  id: string;
  source: "Manual" | "Import";
  errors: string[];
  account_id: string;
  account_name: string;
  invoice_number: string;
  amount: string;
  issue_date: string;
  due_date: string;
  external_ref?: string | undefined;
};

type Mode = AddEntriesSearch["mode"];

/**
 * An account this save brought into existence. Carried by id, not counted,
 * because a brand-new account has no contacts and therefore cannot be chased —
 * and the moment the user learns it exists is the moment to offer the fix.
 */
type CreatedAccount = { id: string; name: string };

/** The account select's value for "this customer isn't in the list yet". */
const NEW_ACCOUNT = "__new__";

const EMPTY_FORM = {
  account_id: "",
  /** Only read when `account_id` is `NEW_ACCOUNT`. */
  account_name: "",
  invoice_number: "",
  amount: "",
  issue_date: "",
  due_date: "",
  external_ref: "",
};

type FormState = typeof EMPTY_FORM;

/**
 * Add Entries screen. Lets the user build up a batch of invoice drafts via
 * manual entry, CSV upload, or spreadsheet paste, review/edit/delete them,
 * and save the whole batch in one call once every draft is valid.
 */
function AddEntriesPage() {
  const { orgs } = Route.useRouteContext();
  const orgId = orgs[0]!.id;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const mode = search.mode;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ invoices: number; accounts: CreatedAccount[] } | null>(null);
  const accountsQuery = useQuery({
    queryKey: accountsQueryKeys.list({ sort: "name", dir: "asc" }),
    queryFn: () => getAccounts({ sort: "name", dir: "asc" }),
    retry: false,
  });
  const accounts = accountsQuery.data?.items ?? [];

  /** The mode lives in the URL, so "upload a file" can be linked to from the Accounts empty state. */
  function setMode(value: Mode) {
    void navigate({ search: { mode: value } });
  }

  const saveMutation = useMutation({
    mutationFn: async (batch: Draft[]) => {
      const resolved = await resolveAccounts(batch);

      // Re-check duplicates now that every draft has a real account id.
      //
      // Two drafts can name one customer differently — "Sharma Traders"
      // picked from the list and "Sharma Traders Pvt Ltd" typed into an
      // import — and the pre-save check cannot see that, because it keys a
      // pending draft on its name and a resolved one on its id. They only
      // collide once both are ids. Left to the database this surfaces as a
      // unique violation reading "an invoice with this number already
      // exists", which points the user at their existing book rather than at
      // the two rows in front of them.
      const checked = resolved.drafts.map((draft, _, all) => ({
        ...draft,
        errors: validateDraft(
          draft,
          all.filter((entry) => entry.id !== draft.id),
        ),
      }));
      if (checked.some((draft) => draft.errors.length > 0)) {
        return { kind: "duplicates" as const, drafts: checked };
      }

      const result = await importInvoices({
        data: {
          org_id: orgId,
          invoices: checked.map(({ id, source, errors, account_name, ...invoice }) => invoice),
        },
      });
      return { kind: "saved" as const, result, accountsCreated: resolved.created };
    },
    onSuccess: async (outcome) => {
      if (outcome.kind === "duplicates") {
        setDrafts(outcome.drafts);
        toast.error(
          "Two entries are for the same account and invoice number. Fix the highlighted rows.",
        );
        return;
      }
      const { result, accountsCreated } = outcome;
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSaved({ invoices: result.created, accounts: accountsCreated });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: invoicesQueryKeys.list(orgId) }),
        queryClient.invalidateQueries({ queryKey: accountsQueryKeys.list() }),
      ]);
    },
    onError: () => toast.error("Couldn't save these invoices. Please try again."),
  });

  /**
   * Creates the accounts this batch names but the org does not have yet, and
   * fills their ids into the drafts.
   *
   * The server matches on its own normalized form, so a name this screen
   * showed as new may come back as an existing account — which is the right
   * answer, and why the created count comes from the response rather than from
   * how many names were sent.
   */
  async function resolveAccounts(
    batch: Draft[],
  ): Promise<{ drafts: Draft[]; created: CreatedAccount[] }> {
    const names = [
      ...new Set(
        batch
          .filter((draft) => draft.account_id === "")
          .map((draft) => draft.account_name.trim())
          .filter((name) => name !== ""),
      ),
    ];
    if (names.length === 0) return { drafts: batch, created: [] };

    const { accounts: ensured } = await ensureAccounts(names);
    const byRequested = new Map(ensured.map((account) => [account.requested_name, account]));
    return {
      drafts: batch.map((draft) => {
        if (draft.account_id !== "") return draft;
        const match = byRequested.get(draft.account_name.trim());
        // Every name sent comes back. A miss means the request and the
        // response disagree about this batch, and saving the rest would leave
        // a half-imported book behind — better to fail the whole click.
        if (!match) throw new Error(`No account came back for "${draft.account_name}".`);
        return { ...draft, account_id: match.account_id, account_name: match.name };
      }),
      // Distinct by id: two spellings of one new customer are one account, and
      // it must not be offered twice on the success screen.
      created: [
        ...new Map(
          ensured
            .filter((account) => account.created)
            .map((account) => [account.account_id, { id: account.account_id, name: account.name }]),
        ).values(),
      ],
    };
  }

  /** Appends a single validated draft (manual entry) to the draft list and clears any prior success state. */
  function addDraft(input: Omit<Draft, "id" | "errors">) {
    const errors = validateDraft(input, drafts);
    setDrafts((current) => [...current, { ...input, id: crypto.randomUUID(), errors }]);
    setSaved(null);
  }

  /**
   * Handles the manual entry form submit: updates the draft in place when
   * `editingId` is set, otherwise appends a new draft, then resets the form.
   */
  function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const creating = form.account_id === NEW_ACCOUNT;
    const input = {
      account_id: creating ? "" : form.account_id,
      account_name: creating
        ? form.account_name.trim()
        : (accounts.find((a) => a.account_id === form.account_id)?.name ?? ""),
      invoice_number: form.invoice_number,
      amount: form.amount,
      issue_date: form.issue_date,
      due_date: form.due_date,
      external_ref: form.external_ref,
      source: "Manual" as const,
    };
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
   * Appends parsed CSV/paste rows as new import drafts and validates each one.
   *
   * The account-name match here is a preview, not a decision: a row that finds
   * no match is marked as a new account rather than rejected, and the server
   * has the final say on which names are new when the batch is saved. Rejects
   * the batch if it would exceed the 500-row limit.
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
          invoice_number: row.invoice_number,
          amount: row.amount,
          issue_date: row.issue_date,
          due_date: row.due_date,
          external_ref: row.external_ref,
          account_id: names.get(normalizeAccount(row.account)) ?? "",
          account_name: row.account.trim(),
          source: "Import" as const,
        };
        return { ...input, id: crypto.randomUUID(), errors: validateDraft(input, current) };
      }),
    ]);
    setParseError(null);
    setSaved(null);
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
    saveMutation.mutate(next);
  }

  if (saved !== null)
    return (
      <SuccessState
        invoices={saved.invoices}
        accounts={saved.accounts}
        onMore={() => {
          setDrafts([]);
          setSaved(null);
          setMode("manual");
        }}
      />
    );

  const newAccounts = new Set(
    drafts
      .filter((draft) => draft.account_id === "")
      .map((draft) => normalizeAccount(draft.account_name)),
  ).size;

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
          newAccounts={newAccounts}
          onEdit={(draft) => {
            setForm({
              account_id: draft.account_id === "" ? NEW_ACCOUNT : draft.account_id,
              account_name: draft.account_name,
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

/**
 * Manual invoice entry form: account picker plus invoice fields, used for both
 * adding a new draft and updating one being edited.
 *
 * The picker can create an account, because otherwise a workspace with no
 * accounts yet has no way to add its first invoice — the select would offer
 * nothing but its own placeholder.
 */
function ManualForm({
  form,
  setForm,
  accounts,
  onSubmit,
  editing,
}: {
  form: FormState;
  setForm: (value: FormState) => void;
  accounts: { account_id: string; name: string }[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  editing: boolean;
}) {
  const update = (key: keyof FormState, value: string) => setForm({ ...form, [key]: value });
  const creating = form.account_id === NEW_ACCOUNT;
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
            <option value="">
              {accounts.length === 0 ? "No accounts yet" : "Choose an account"}
            </option>
            {accounts.map((account) => (
              <option key={account.account_id} value={account.account_id}>
                {account.name}
              </option>
            ))}
            <option value={NEW_ACCOUNT}>+ New account</option>
          </select>
        </Field>
        {creating ? (
          <Field label="New account name">
            <input
              required
              autoFocus
              value={form.account_name}
              onChange={(e) => update("account_name", e.target.value)}
              placeholder="Sharma Traders Pvt Ltd"
              className="field"
            />
          </Field>
        ) : null}
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
            onChange={(e) => {
              const issue_date = e.target.value;
              setForm({
                ...form,
                issue_date,
                due_date: form.due_date && form.due_date < issue_date ? "" : form.due_date,
              });
            }}
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
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-prose text-fg-soft">
          {creating ? "The account is created when you save this batch." : " "}
        </p>
        <AppButton type="submit">
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
        Customers you haven't billed before are added as you save.
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
  newAccounts,
  onEdit,
  onDelete,
  onSave,
  saving,
}: {
  drafts: Draft[];
  newAccounts: number;
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
            {newAccounts
              ? ` · ${newAccounts} new ${newAccounts === 1 ? "account" : "accounts"}`
              : ""}
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
                  <span className="flex flex-wrap items-center gap-2">
                    {draft.account_name || "No account"}
                    {draft.account_id === "" && draft.account_name ? (
                      <span className="inline-flex items-center rounded-pill bg-alt px-2.5 py-0.5 text-pill font-semibold text-fg-soft">
                        New
                      </span>
                    ) : null}
                  </span>
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

/**
 * Confirmation screen shown after a successful save.
 *
 * Names each account that was created rather than counting them: every one
 * arrives with no contacts and so cannot be chased, and "2 new accounts were
 * created" leaves the user to go and find out which two. Each row links
 * straight to its own add-contact form.
 */
function SuccessState({
  invoices,
  accounts,
  onMore,
}: {
  invoices: number;
  accounts: CreatedAccount[];
  onMore: () => void;
}) {
  return (
    <div
      className="mx-auto max-w-xl rounded-card border border-accent-edge bg-card p-10 text-center"
      role="status"
    >
      <h1 className="text-title font-bold text-fg">
        {invoices} {invoices === 1 ? "invoice" : "invoices"} added
      </h1>
      <p className="mt-2 text-prose text-fg-soft">
        Your invoices were confirmed by the server and are ready to review.
      </p>

      {accounts.length > 0 ? (
        <div className="mt-6 rounded-card border border-hairline bg-subtle p-4 text-left">
          <p className="text-body font-semibold text-fg">
            {accounts.length} new {accounts.length === 1 ? "account" : "accounts"} created
          </p>
          <p className="mt-1 text-prose text-fg-soft">
            {accounts.length === 1 ? "It can't be chased" : "None of them can be chased"} until
            {accounts.length === 1 ? " it has" : " they have"} a primary contact.
          </p>
          <ul className="mt-3 space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-card px-3 py-2"
              >
                <span className="min-w-0 truncate text-body font-semibold text-fg">
                  {account.name}
                </span>
                <Link
                  to="/app/accounts/$accountId"
                  params={{ accountId: account.id }}
                  search={{ tab: "contacts", add: "P0" }}
                  className="shrink-0 rounded-nav px-2 py-1 text-body font-semibold text-accent hover:text-accent-hover"
                >
                  Add contact
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

/**
 * The key used to detect duplicate drafts: the account plus the invoice number
 * normalized for whitespace, punctuation, and case.
 *
 * A draft whose account does not exist yet keys on its normalized name rather
 * than an id. Two rows naming the same new customer with the same invoice
 * number are still duplicates, and catching that before the save means the
 * batch fails without having created accounts for it first.
 *
 * `null` when there is not enough to compare — an incomplete draft has its own
 * errors and must not collide with every other incomplete one.
 */
function invoiceKey(
  input: Pick<Draft, "account_id" | "account_name" | "invoice_number">,
): string | null {
  const account = input.account_id || normalizeAccount(input.account_name);
  if (!account || !input.invoice_number.trim()) return null;
  return `${account}:${input.invoice_number
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^\W+|\W+$/g, "")
    .toUpperCase()}`;
}

/**
 * Validates a single draft and checks it for a duplicate invoice number
 * against the other given drafts. Returns the combined, deduplicated list of
 * error messages (empty when the draft is valid).
 *
 * Which schema applies depends on whether the account exists yet: a draft
 * still waiting for its account to be created has no id to validate, so it is
 * held to `invoiceDraftPendingAccountSchema` — the same rules on every other
 * field. Both end at `invoiceDraftSchema` before the batch is sent.
 */
function validateDraft(
  input: Omit<Draft, "id" | "errors">,
  drafts: readonly Pick<Draft, "account_id" | "account_name" | "invoice_number">[],
): string[] {
  const parsed =
    input.account_id === ""
      ? invoiceDraftPendingAccountSchema.safeParse(input)
      : invoiceDraftSchema.safeParse(input);
  const errors = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  const key = invoiceKey(input);
  if (key !== null && drafts.some((draft) => invoiceKey(draft) === key))
    errors.push("Duplicate invoice number in this import.");
  return [...new Set(errors)];
}
