import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AccountChasingSettings } from "@/lib/schemas/accounts";
import { updateChasingSettings } from "@/lib/services/accounts";
import { getAccounts, getAccount } from "@/lib/services/accounts";

export const Route = createFileRoute("/app/chasing/overrides")({
  head: () => ({ meta: [{ title: "Cadence overrides — Chasing" }] }),
  component: CadenceOverridesPage,
});

interface OverrideRow {
  accountId: string;
  accountName: string;
  type: string;
  differs: string;
  outstanding: string;
  setBy: string;
  setOn: string;
  isStale: boolean;
}

/** Cadence overrides page: lists accounts with non-default cadence and allows reset. */
function CadenceOverridesPage() {
  const [resetConfirmId, setResetConfirmId] = useState<string | null>(null);

  const accountDetailsQueries = useQuery({
    queryKey: ["accounts-with-overrides"],
    queryFn: async () => {
      const accounts = await getAccounts();
      const overrides: OverrideRow[] = [];
      const now = new Date();
      for (const account of accounts.items) {
        const detail = await getAccount(account.account_id);
        const settings = detail.settings;
        if (settings.chase_mode !== "default" || settings.send_window_mode !== "default") {
          const isStale =
            settings.chase_mode === "stopped" &&
            new Date(settings.archived_at || detail.updated_at).getTime() <
              now.getTime() - 90 * 24 * 60 * 60 * 1000;

          overrides.push({
            accountId: account.account_id,
            accountName: account.name,
            type: settings.chase_mode === "stopped" ? "Not chased" : "Custom cadence",
            differs: getDiffers(settings),
            outstanding: account.outstanding,
            setBy: settings.owner_name || "Unknown",
            setOn: detail.updated_at,
            isStale,
          });
        }
      }
      return overrides;
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const detail = await getAccount(accountId);
      const settings = detail.settings;
      return updateChasingSettings(
        accountId,
        {
          chase_mode: "default",
          send_window_mode: "default",
          terms_preset: settings.terms_preset,
          term_days: settings.term_days,
          is_msme: settings.is_msme,
          tds_section: settings.tds_section,
          tds_rate: settings.tds_rate,
          owner_user_id: settings.owner_user_id,
          notes: settings.notes,
        },
        detail.updated_at,
      );
    },
    onSuccess: () => {
      toast.success("Reset to default cadence");
      setResetConfirmId(null);
      void accountDetailsQueries.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Couldn't reset cadence");
    },
  });

  const overrides = accountDetailsQueries.data || [];
  const isEmpty = overrides.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-bold tracking-tight text-fg">Cadence overrides</h1>
          <p className="mt-1 text-prose text-fg-soft">
            {isEmpty
              ? "All accounts use the default cadence."
              : `${overrides.length} account${overrides.length === 1 ? "" : "s"} don't use the default cadence.`}
          </p>
        </div>
        <a
          href="/app/chasing/cadence"
          className="inline-block rounded-lg border border-hairline bg-card px-4 py-2 text-body font-semibold text-fg hover:bg-hovered"
        >
          Back to cadence
        </a>
      </div>

      {accountDetailsQueries.isPending ? (
        <div className="py-10 text-center text-prose text-fg-soft">Loading overrides...</div>
      ) : accountDetailsQueries.isError ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <p className="text-body font-semibold text-fg">
            {accountDetailsQueries.error instanceof Error
              ? accountDetailsQueries.error.message
              : "Couldn't load overrides."}
          </p>
          <AppButton
            variant="secondary"
            onClick={() => {
              void accountDetailsQueries.refetch();
            }}
          >
            Retry
          </AppButton>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-4 rounded-card border border-hairline bg-card p-14 text-center">
          <div className="space-y-2">
            <h2 className="text-section font-bold text-fg">
              Every account uses the default cadence.
            </h2>
            <p className="text-prose text-fg-soft">
              Overrides you set from an account's Cadence page show up here.
            </p>
          </div>
          <a
            href="/app/chasing/cadence"
            className="mt-2 inline-block rounded-lg border border-hairline bg-card px-4 py-2 text-body font-semibold text-fg hover:bg-hovered"
          >
            Back to cadence
          </a>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-hairline bg-card">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-hairline bg-subtle">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-soft">
                  Account
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-soft">
                  Override type
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-soft">
                  What differs
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-fg-soft">
                  Outstanding
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-soft">
                  Set by
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-fg-soft">
                  Set on
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-fg-soft" />
              </tr>
            </thead>
            <tbody>
              {overrides.map((override) => (
                <tr key={override.accountId} className="border-b border-hairline hover:bg-subtle">
                  <td className="px-4 py-3">
                    <a
                      href={`/app/accounts/${override.accountId}`}
                      className="text-body font-semibold text-accent hover:underline"
                    >
                      {override.accountName}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                        override.type === "Not chased"
                          ? "bg-danger-tint text-danger"
                          : "bg-subtle text-fg-soft"
                      }`}
                    >
                      {override.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-body font-semibold text-fg">{override.differs}</span>
                      {override.isStale && (
                        <span className="inline-block rounded-full bg-warn-tint px-2.5 py-1 text-xs font-semibold text-warn">
                          Review
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-body font-semibold text-fg tnum">
                    {override.outstanding}
                  </td>
                  <td className="px-4 py-3 text-body font-semibold text-fg">{override.setBy}</td>
                  <td className="px-4 py-3 text-right text-prose text-fg-soft tnum">
                    {formatDate(override.setOn)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setResetConfirmId(override.accountId)}
                      className="text-body font-semibold text-accent hover:text-accent-strong"
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={resetConfirmId !== null}
        onOpenChange={(open) => !open && setResetConfirmId(null)}
      >
        <DialogContent className="rounded-card border-hairline bg-card p-5 sm:max-w-[440px]">
          <DialogTitle className="text-section font-bold tracking-tight text-fg">
            Reset to default cadence?
          </DialogTitle>
          <DialogDescription className="mt-2 text-prose font-normal text-fg-soft">
            This account will use the organization's default cadence settings.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton variant="text" onClick={() => setResetConfirmId(null)}>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => {
                if (resetConfirmId) {
                  resetMutation.mutate(resetConfirmId);
                }
              }}
              loading={resetMutation.isPending}
            >
              Reset to default
            </AppButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Describes what cadence settings differ from the default. */
function getDiffers(settings: AccountChasingSettings): string {
  const diffs: string[] = [];
  if (settings.chase_mode === "stopped") {
    return "No longer chased";
  }
  const tone = settings.steps[0]?.tone;
  if (tone && tone !== settings.default_steps[0]?.tone) {
    diffs.push(`${tone} tone`);
  }
  const channel = settings.steps[0]?.channel;
  if (channel && channel !== settings.default_steps[0]?.channel) {
    diffs.push(`${channel} channel`);
  }
  if (settings.send_window_mode === "custom") {
    diffs.push("Custom send window");
  }
  return diffs.length > 0 ? diffs.join(", ") : "Custom cadence";
}

/** Formats ISO date string to localized display format (en-IN), or "Unknown" on parse error. */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "Unknown";
  }
}
