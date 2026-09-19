import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type {
  AccountDetail,
  ArchiveAccountBody,
  PauseAccountBody,
  UpdateChasingSettingsBody,
} from "@/lib/schemas/accounts";
import {
  AccountsApiError,
  accountsQueryKeys,
  archiveAccount,
  pauseAccount,
  restoreAccount,
  resumeAccount,
  updateChasingSettings,
} from "@/lib/services/accounts";

function applyChasingSettingsPatch(
  settings: AccountDetail["settings"],
  body: UpdateChasingSettingsBody,
): AccountDetail["settings"] {
  const next: AccountDetail["settings"] = {
    ...settings,
    chase_mode: body.chase_mode,
    stop_reason: body.stop_reason === undefined ? settings.stop_reason : body.stop_reason,
    stop_note: body.stop_note === undefined ? settings.stop_note : body.stop_note,
    send_window_mode: body.send_window_mode,
    send_window:
      body.send_window === undefined
        ? settings.send_window
        : {
            opens_at: body.send_window.opens_at,
            closes_at: body.send_window.closes_at,
            days: [...body.send_window.days],
          },
    terms_preset: body.terms_preset,
    term_days: body.term_days,
    is_msme: body.is_msme,
    tds_section: body.tds_section,
    tds_rate: body.tds_rate,
    owner_user_id: body.owner_user_id,
    notes: body.notes,
    steps:
      body.steps === undefined
        ? settings.steps
        : settings.steps.map((step) => {
            const patch = body.steps!.find((entry) => entry.key === step.key);
            return patch ? { ...step, ...patch } : step;
          }),
  };

  if (body.chase_mode === "stopped" && body.stop_reason) {
    next.paused_at = settings.paused_at ?? new Date().toISOString();
    next.pause_reason = body.stop_reason === "Relationship hold" ? "Other" : body.stop_reason;
  }

  return next;
}

export function useUpdateChasingSettings(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.detail(accountId);

  return useMutation({
    mutationFn: (vars: { body: UpdateChasingSettingsBody; ifMatch: string }) =>
      updateChasingSettings(accountId, vars.body, vars.ifMatch),

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AccountDetail>(queryKey);
      if (!previous) return { previous: undefined };

      const settings = applyChasingSettingsPatch(previous.settings, vars.body);

      queryClient.setQueryData<AccountDetail>(queryKey, {
        ...previous,
        settings,
        ...(vars.body.chase_mode === "stopped" && vars.body.stop_reason
          ? {
              chase_status: "paused" as const,
              status_label: "Paused" as const,
              header_status: `Chasing paused — ${vars.body.stop_reason}`,
            }
          : {}),
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
      toast.error("Couldn't save settings.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: accountsQueryKeys.activity(accountId) });
    },
  });
}

/** Archives the account. It stays readable under Accounts → Archived until restored. */
export function useArchiveAccount(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.detail(accountId);

  return useMutation({
    mutationFn: (vars: { body: ArchiveAccountBody; ifMatch: string }) =>
      archiveAccount(accountId, vars.body, vars.ifMatch),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AccountDetail>(queryKey);
      if (!previous) return { previous: undefined };

      queryClient.setQueryData<AccountDetail>(queryKey, {
        ...previous,
        settings: {
          ...previous.settings,
          archived_at: new Date().toISOString(),
        },
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
      toast.error("Couldn't archive this account.");
    },

    // The account stays readable under Accounts → Archived, so keep the
    // returned copy rather than dropping the page into a 404.
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      invalidateAfterArchiveChange(queryClient, accountId);
    },
  });
}

/**
 * Archiving or restoring moves the account between the two list views and in
 * or out of every total, so the lists, its tabs and the dashboard all refetch.
 */
function invalidateAfterArchiveChange(
  queryClient: ReturnType<typeof useQueryClient>,
  accountId: string,
): void {
  void queryClient.invalidateQueries({ queryKey: ["accounts", "list"] });
  void queryClient.invalidateQueries({ queryKey: accountsQueryKeys.invoices(accountId) });
  void queryClient.invalidateQueries({ queryKey: accountsQueryKeys.activityRoot(accountId) });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}

/** Restores an archived account (admins only). */
export function useRestoreAccount(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.detail(accountId);

  return useMutation({
    mutationFn: (vars: { ifMatch: string }) => restoreAccount(accountId, vars.ifMatch),

    onError: (error) => {
      if (error instanceof AccountsApiError) {
        toast.error(error.message);
        return;
      }
      toast.error("Couldn't restore this account.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      invalidateAfterArchiveChange(queryClient, accountId);
      toast.success(`${data.name} is back in your accounts.`);
    },
  });
}

export function usePauseAccount(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.detail(accountId);

  return useMutation({
    mutationFn: (vars: { body: PauseAccountBody; ifMatch: string }) =>
      pauseAccount(accountId, vars.body, vars.ifMatch),

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AccountDetail>(queryKey);
      if (!previous) return { previous: undefined };

      queryClient.setQueryData<AccountDetail>(queryKey, {
        ...previous,
        chase_status: "paused",
        status_label: "Paused",
        header_status: `Chasing paused — ${vars.body.reason}`,
        settings: {
          ...previous.settings,
          paused_at: previous.settings.paused_at ?? new Date().toISOString(),
          pause_reason: vars.body.reason,
          paused_until: vars.body.until ?? null,
        },
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
      toast.error("Couldn't pause chasing.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: accountsQueryKeys.activityRoot(accountId) });
    },
  });
}

export function useResumeAccount(accountId: string) {
  const queryClient = useQueryClient();
  const queryKey = accountsQueryKeys.detail(accountId);

  return useMutation({
    mutationFn: (vars: { ifMatch: string }) => resumeAccount(accountId, vars.ifMatch),

    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<AccountDetail>(queryKey);
      if (!previous) return { previous: undefined };

      queryClient.setQueryData<AccountDetail>(queryKey, {
        ...previous,
        settings: {
          ...previous.settings,
          paused_at: null,
          pause_reason: null,
          paused_until: null,
        },
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
      toast.error("Couldn't resume chasing.");
    },

    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      void queryClient.invalidateQueries({ queryKey: accountsQueryKeys.activityRoot(accountId) });
    },
  });
}
