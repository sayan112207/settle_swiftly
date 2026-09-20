import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { ContactFields } from "@/components/app/ContactForm";
import { PRODUCT_NAME } from "@/lib/brand";
import { accountNameSchema } from "@/lib/schemas/accounts";
import {
  EMPTY_CONTACT,
  collectFieldErrors,
  contactFormSchema,
  toCreateBody,
  type ContactFieldErrors,
  type ContactFormValues,
} from "@/lib/schemas/contact-form";
import {
  AccountsApiError,
  accountsQueryKeys,
  createAccountContact,
  ensureAccounts,
  getAccountContacts,
} from "@/lib/services/accounts";

export const Route = createFileRoute("/app/accounts/new")({
  head: () => ({ meta: [{ title: `New account — ${PRODUCT_NAME}` }] }),
  component: NewAccountPage,
});

/**
 * Creates an account and, in the same submit, its primary contact.
 *
 * The contact is here rather than on a second screen because an account
 * without a usable P0 cannot be chased, and chasing is the point — a name-only
 * account lands in the list reading "Can't chase" with no hint that a contact
 * is what it is waiting for. It stays optional, though: the database is
 * deliberate that an account may sit P0-less (adding one is a precondition of
 * chasing, not of existing), and an import that creates accounts ahead of their
 * contacts must not be blocked.
 */
function NewAccountPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [withContact, setWithContact] = useState(true);
  const [contact, setContact] = useState<ContactFormValues>(EMPTY_CONTACT);
  const [contactErrors, setContactErrors] = useState<ContactFieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async (vars: { name: string; contact: ContactFormValues | null }) => {
      const { accounts } = await ensureAccounts([vars.name]);
      const account = accounts[0];
      if (!account) throw new Error("The server did not return the account.");

      if (!vars.contact) return { account, contactAdded: false, contactError: null };

      // Two calls, and the account is already saved by the time the second
      // runs. A contact failure is therefore reported rather than thrown: the
      // account exists whatever happens next, and "couldn't add that account"
      // would be a lie that sends the user back to create a duplicate.
      try {
        // The contact endpoint is guarded by the ladder's own version token,
        // and only a read can mint it — there is nothing cached for an account
        // that did not exist a moment ago.
        const ladder = await getAccountContacts(account.account_id);
        await createAccountContact(
          account.account_id,
          toCreateBody(vars.contact),
          ladder.updated_at,
        );
        return { account, contactAdded: true, contactError: null };
      } catch (cause) {
        return {
          account,
          contactAdded: false,
          contactError:
            cause instanceof AccountsApiError
              ? cause.message
              : "The account was saved, but its contact wasn't.",
        };
      }
    },
    onSuccess: async ({ account, contactAdded, contactError }) => {
      await queryClient.invalidateQueries({ queryKey: accountsQueryKeys.list() });
      if (contactError) {
        // Land on Contacts regardless: that is where the half-finished job is.
        toast.error(`${account.name} was added, but the contact wasn't. ${contactError}`);
      } else {
        toast.success(
          account.created
            ? `${account.name} added${contactAdded ? " with its primary contact" : ""}.`
            : `${account.name} already exists — opening it instead.`,
        );
      }
      void navigate({
        to: "/app/accounts/$accountId",
        params: { accountId: account.account_id },
        search: { tab: contactAdded || contactError ? "contacts" : "invoices" },
      });
    },
    onError: (cause) => {
      setFailure(
        cause instanceof AccountsApiError
          ? cause.message
          : "Couldn't add that account. Please try again.",
      );
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);

    const parsedName = accountNameSchema.safeParse(name);
    if (!parsedName.success) {
      setNameError(parsedName.error.issues[0]?.message ?? "Enter the customer's name.");
      return;
    }
    setNameError(null);

    if (!withContact) {
      createMutation.mutate({ name: parsedName.data, contact: null });
      return;
    }

    const parsedContact = contactFormSchema.safeParse(contact);
    if (!parsedContact.success) {
      setContactErrors(collectFieldErrors(parsedContact.error));
      return;
    }
    setContactErrors({});
    createMutation.mutate({ name: parsedName.data, contact: parsedContact.data });
  }

  const busy = createMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-title font-bold tracking-tight text-fg">New account</h1>
        <p className="mt-1 text-prose text-fg-soft">
          The customer who owes you money, and the person you chase about it.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-6">
        <section className="rounded-card border border-hairline bg-card p-6">
          <label className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
            <span className="mb-2 block">Account name</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
              }}
              disabled={busy}
              placeholder="Sharma Traders Pvt Ltd"
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? "account-name-error" : undefined}
              className="field"
            />
          </label>
          {nameError ? (
            <p id="account-name-error" role="alert" className="mt-2 text-prose text-danger">
              {nameError}
            </p>
          ) : null}
          <p className="mt-2 text-prose text-fg-soft">
            Name it the way your invoices do. "Sharma Traders" and "Sharma Traders Pvt Ltd" are
            treated as the same customer.
          </p>
        </section>

        <section className="space-y-4 rounded-card border border-hairline bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-section font-bold text-fg">Primary contact</h2>
              <p className="mt-1 text-prose text-fg-soft">
                {withContact
                  ? "Who reminders go to. An account can't be chased without one."
                  : "Skipped — this account will show as Can't chase until you add one."}
              </p>
            </div>
            <AppButton
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setWithContact((current) => !current);
                setContactErrors({});
              }}
            >
              {withContact ? "Skip for now" : "Add a contact"}
            </AppButton>
          </div>

          {withContact ? (
            <ContactFields
              values={contact}
              errors={contactErrors}
              busy={busy}
              onChange={(key, value) => {
                setContact((current) => ({ ...current, [key]: value }));
                setContactErrors((current) => ({ ...current, [key]: undefined }));
              }}
            />
          ) : null}
        </section>

        {failure ? (
          <p
            role="alert"
            className="rounded-card border border-danger-edge bg-danger-tint p-3 text-body text-danger"
          >
            {failure}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <AppButton
            variant="secondary"
            disabled={busy}
            onClick={() => {
              void navigate({ to: "/app/accounts" });
            }}
          >
            Cancel
          </AppButton>
          <AppButton type="submit" loading={busy}>
            {withContact ? "Add account and contact" : "Add account"}
          </AppButton>
        </div>
      </form>
    </div>
  );
}
