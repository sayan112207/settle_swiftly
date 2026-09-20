import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { PRODUCT_NAME } from "@/lib/brand";
import { accountNameSchema } from "@/lib/schemas/accounts";
import { AccountsApiError, accountsQueryKeys, ensureAccounts } from "@/lib/services/accounts";

export const Route = createFileRoute("/app/accounts/new")({
  head: () => ({ meta: [{ title: `New account — ${PRODUCT_NAME}` }] }),
  component: NewAccountPage,
});

/**
 * Creates one account by name.
 *
 * Name only, on purpose. Terms, contacts and chasing settings all have
 * considered defaults and their own editor on the account's Settings tab; a
 * six-field form here would be six fields between the user and the invoice
 * they actually came to add.
 */
function NewAccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (value: string) => ensureAccounts([value]),
    onSuccess: async (result) => {
      const account = result.accounts[0];
      if (!account) {
        setError("That name couldn't be saved. Check it and try again.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["accounts", "list"] });
      // A match on an existing account is not a failure — the user wanted this
      // customer to exist, and it does. Say which happened and go there.
      toast.success(
        account.created
          ? `${account.name} added.`
          : `${account.name} already exists — opening it instead.`,
      );
      void navigate({ to: "/app/accounts/$accountId", params: { accountId: account.account_id } });
    },
    onError: (cause) => {
      setError(
        cause instanceof AccountsApiError
          ? cause.message
          : "Couldn't add that account. Please try again.",
      );
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = accountNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the customer's name.");
      return;
    }
    setError(null);
    createMutation.mutate(parsed.data);
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="text-title font-bold tracking-tight text-fg">New account</h1>
        <p className="mt-1 text-prose text-fg-soft">
          The customer who owes you money. You can add their contacts and chasing settings once
          they're here.
        </p>
      </header>

      <form onSubmit={submit} className="rounded-card border border-hairline bg-card p-6">
        <label className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
          <span className="mb-2 block">Account name</span>
          <input
            autoFocus
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="Sharma Traders Pvt Ltd"
            aria-invalid={error !== null}
            aria-describedby={error ? "account-name-error" : undefined}
            className="field"
          />
        </label>
        <p className="mt-2 text-prose text-fg-soft">
          Name it the way your invoices do. "Sharma Traders" and "Sharma Traders Pvt Ltd" are
          treated as the same customer.
        </p>

        {error ? (
          <p
            id="account-name-error"
            role="alert"
            className="mt-4 rounded-card border border-danger-edge bg-danger-tint p-3 text-body text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <AppButton
            variant="secondary"
            // Disabled mid-flight because the success handler navigates to the
            // new account. Leaving on Cancel and then being pulled onto a
            // detail page a moment later reads as the app ignoring the click.
            disabled={createMutation.isPending}
            onClick={() => {
              void navigate({ to: "/app/accounts" });
            }}
          >
            Cancel
          </AppButton>
          <AppButton type="submit" loading={createMutation.isPending}>
            Add account
          </AppButton>
        </div>
      </form>
    </div>
  );
}
