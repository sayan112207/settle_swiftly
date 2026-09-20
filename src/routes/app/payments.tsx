import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AccountPaymentsPanel } from "@/components/app/AccountPaymentsPanel";
import type { AccountListItem } from "@/lib/schemas/accounts";
import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { PRODUCT_NAME } from "@/lib/brand";
import { AccountsApiError, accountsQueryKeys, getAccounts } from "@/lib/services/accounts";

/**
 * Payments page URL state. `accountId` is optional so the page still works
 * as a bare picker, but can also be deep-linked straight to one account's
 * ledger (e.g. from an "unapplied credit" banner elsewhere in the app).
 */
const paymentsSearchSchema = z.object({
  accountId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/app/payments")({
  validateSearch: paymentsSearchSchema,
  head: () => ({ meta: [{ title: `Payments — ${PRODUCT_NAME}` }] }),
  component: PaymentsPage,
});

/**
 * Payments page. The API contract only exposes payments per account
 * (`GET /api/v1/accounts/{id}/payments` — see docs/accounts-contract.md);
 * there is no org-wide payments endpoint. Rather than fabricate one, this
 * page is an account picker backed by `AccountPaymentsPanel` — the same
 * stats/table/unapplied-credit view already used on the account detail
 * screen, reused here instead of duplicated.
 */
function PaymentsPage() {
  const { accountId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const accountsQuery = useQuery({
    queryKey: accountsQueryKeys.list({ sort: "name", dir: "asc" }),
    queryFn: () => getAccounts({ sort: "name", dir: "asc" }),
    retry: false,
  });

  const accounts = accountsQuery.data?.items ?? [];
  const selected = accounts.find((account) => account.account_id === accountId);

  function selectAccount(nextId: string) {
    void navigate({
      search: (prev) => (nextId ? { ...prev, accountId: nextId } : {}),
      replace: true,
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-title font-bold tracking-tight text-fg">Payments</h1>
        <p className="mt-1 text-prose text-fg-soft">
          Choose an account to review its payment history, unapplied credit, and reconciliation
          status.
        </p>
      </header>

      {accountsQuery.isPending ? <PaymentsPickerLoading /> : null}

      {accountsQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <p className="text-body font-semibold text-fg">
            {accountsQuery.error instanceof AccountsApiError
              ? accountsQuery.error.message
              : "Couldn't load your accounts."}
          </p>
          <AppButton
            variant="secondary"
            onClick={() => {
              void accountsQuery.refetch();
            }}
          >
            Retry
          </AppButton>
        </div>
      ) : null}

      {!accountsQuery.isPending && !accountsQuery.isError ? (
        accounts.length === 0 ? (
          <p className="rounded-card border border-hairline bg-card p-6 text-body text-fg-soft">
            No accounts yet.
          </p>
        ) : (
          <>
            <AccountPicker accounts={accounts} selectedId={accountId} onChange={selectAccount} />
            <PaymentsForSelection accountId={accountId} selected={selected} />
          </>
        )
      ) : null}
    </div>
  );
}

/** Native account `<select>`, styled to match the rest of the app's form controls. */
function AccountPicker({
  accounts,
  selectedId,
  onChange,
}: {
  accounts: Pick<AccountListItem, "account_id" | "name">[];
  selectedId: string | undefined;
  onChange: (accountId: string) => void;
}) {
  return (
    <div className="max-w-sm">
      <label
        htmlFor="payments-account"
        className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
      >
        Account
      </label>
      <select
        id="payments-account"
        value={selectedId ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
      >
        <option value="">Choose an account</option>
        {accounts.map((account) => (
          <option key={account.account_id} value={account.account_id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Renders the selected account's payments panel, a "not found" message for a
 * stale/invalid `accountId` in the URL, or a prompt when nothing is picked
 * yet.
 */
function PaymentsForSelection({
  accountId,
  selected,
}: {
  accountId: string | undefined;
  selected: Pick<AccountListItem, "account_id" | "name"> | undefined;
}) {
  if (!accountId) {
    return (
      <p className="rounded-card border border-hairline bg-card p-6 text-body text-fg-soft">
        Pick an account above to see its payments.
      </p>
    );
  }
  if (!selected) {
    return (
      <p
        role="alert"
        className="rounded-card border border-hairline bg-card p-6 text-body text-fg-soft"
      >
        That account couldn't be found. Choose another one above.
      </p>
    );
  }
  return <AccountPaymentsPanel accountId={selected.account_id} accountName={selected.name} />;
}

/** Loading placeholder for the account picker while the accounts list is in flight. */
function PaymentsPickerLoading() {
  return (
    <div className="max-w-sm space-y-2" aria-busy="true" aria-label="Loading accounts">
      <AppSkeleton className="h-10 w-full" />
    </div>
  );
}
