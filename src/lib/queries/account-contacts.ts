import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type {
  AccountContact,
  AccountContacts,
  UpdateContactBody,
  UpdateEscalationBody,
} from "@/lib/schemas/accounts";
import {
  AccountsApiError,
  accountsQueryKeys,
  deleteAccountContact,
  updateAccountContact,
  updateAccountEscalation,
} from "@/lib/services/accounts";

/**
 * THE contact-update mutation pattern — first mutation in the product app.
 *
 * Later contact writes (channels, Always CC, language, …) should call this same
 * hook. Do not invent a second optimistic shape.
 *
 * Flow:
 * 1. cancelQueries so a slow refetch cannot clobber the optimistic write
 * 2. snapshot previous cache for rollback
 * 3. patch the cached AccountContacts (full resource shape)
 * 4. onError → restore snapshot; toast AccountsApiError.message verbatim
 * 5. onSuccess → replace cache with the server’s full resource (If-Match truth)
 *
 * Exception: last usable P0 + do_not_contact. Contract §2.3 rejects that with
 * `last_p0_required`. We skip the optimistic patch so the card never disappears
 * before the server answers.
 */
export function useUpdateAccountContact(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.contacts(accountId);

  return useMutation({
    mutationFn: (vars: { contactId: string; body: UpdateContactBody; ifMatch: string }) =>
      updateAccountContact(accountId, vars.contactId, vars.body, vars.ifMatch),

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AccountContacts>(queryKey);

      if (!previous) return { previous: undefined };

      const target = previous.contacts.find((c) => c.contact_id === vars.contactId);
      if (target && wouldRemoveLastUsableP0(previous, target, vars.body)) {
        // Wait for the server — never optimistically strip the last P0.
        return { previous, skippedOptimistic: true as const };
      }

      queryClient.setQueryData<AccountContacts>(queryKey, {
        ...previous,
        contacts: previous.contacts.map((contact) =>
          contact.contact_id === vars.contactId ? applyContactPatch(contact, vars.body) : contact,
        ),
      });

      return { previous, skippedOptimistic: false as const };
    },

    onError: (error, _vars, context) => {
      if (context?.previous && context.skippedOptimistic !== true) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      if (error instanceof AccountsApiError) {
        toast.error(error.message);
        return;
      }
      toast.error("Couldn't update that contact.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}

/**
 * Escalation timing — same optimistic shape as contact update.
 * Callers must not invoke this when p2_after_days ≤ p1_after_days.
 */
export function useUpdateAccountEscalation(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.contacts(accountId);

  return useMutation({
    mutationFn: (vars: { body: UpdateEscalationBody; ifMatch: string }) =>
      updateAccountEscalation(accountId, vars.body, vars.ifMatch),

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AccountContacts>(queryKey);

      if (!previous) return { previous: undefined };

      queryClient.setQueryData<AccountContacts>(queryKey, {
        ...previous,
        p1_after_days: vars.body.p1_after_days,
        p2_after_days: vars.body.p2_after_days,
      });

      return { previous };
    },

    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }

      if (error instanceof AccountsApiError) {
        toast.error(error.message);
        return;
      }
      toast.error("Couldn't update escalation timing.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}

/**
 * Delete must not remove the card from the cache up front. A last-P0 delete
 * returns `last_p0_required` and the card has to stay put with the server copy.
 */
export function useDeleteAccountContact(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.contacts(accountId);

  return useMutation({
    mutationFn: (vars: { contactId: string; ifMatch: string }) =>
      deleteAccountContact(accountId, vars.contactId, vars.ifMatch),

    // No onMutate — do not optimistically remove.

    onError: (error) => {
      if (error instanceof AccountsApiError) {
        toast.error(error.message);
        return;
      }
      toast.error("Couldn't remove that contact.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });
}

function usableP0Count(contacts: AccountContacts): number {
  return contacts.contacts.filter((c) => c.tier === "P0" && !c.do_not_contact).length;
}

function wouldRemoveLastUsableP0(
  contacts: AccountContacts,
  target: AccountContact,
  body: UpdateContactBody,
): boolean {
  if (target.tier !== "P0" || target.do_not_contact) return false;
  if (body.do_not_contact !== true) return false;
  return usableP0Count(contacts) <= 1;
}

function applyContactPatch(contact: AccountContact, body: UpdateContactBody): AccountContact {
  return {
    ...contact,
    name: body.name ?? contact.name,
    designation: body.designation === undefined ? contact.designation : body.designation,
    email: body.email === undefined ? contact.email : body.email,
    phone: body.phone === undefined ? contact.phone : body.phone,
    tier: body.tier ?? contact.tier,
    channel_email: body.channel_email ?? contact.channel_email,
    channel_whatsapp: body.channel_whatsapp ?? contact.channel_whatsapp,
    channel_sms: body.channel_sms ?? contact.channel_sms,
    always_cc: body.always_cc ?? contact.always_cc,
    language: body.language ?? contact.language,
    do_not_contact: body.do_not_contact ?? contact.do_not_contact,
    dnc_reason: body.dnc_reason === undefined ? contact.dnc_reason : body.dnc_reason,
  };
}
