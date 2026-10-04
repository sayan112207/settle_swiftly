import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { CadenceStepEditor } from "@/components/app/CadenceStepEditor";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useUpdateChasingSettings } from "@/lib/queries/account-detail";
import { accountsQueryKeys, getAccounts, getAccount } from "@/lib/services/accounts";
import { chaseStopReasonSchema, weekdaySchema } from "@/lib/schemas/accounts";
import type { CadenceStep, ChaseMode, ChaseStopReason, Weekday } from "@/lib/schemas/accounts";

export const Route = createFileRoute("/app/chasing/cadence")({
  head: () => ({ meta: [{ title: "Cadence — Chasing" }] }),
  component: CadencePage,
});

const STOP_REASONS = chaseStopReasonSchema.options;
const WEEKDAYS = weekdaySchema.options;

const TIME_OPTIONS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
];

/** Formats 24-hour time string (HH:MM) to 12-hour display format with AM/PM suffix. */
function formatTime(value: string) {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

type Snapshot = {
  mode: ChaseMode;
  steps: CadenceStep[];
  stopReason: ChaseStopReason | "";
  stopNote: string;
  windowMode: "default" | "custom";
  opensAt: string;
  closesAt: string;
  days: Weekday[];
};

/** Cadence configuration page: edit default or account-specific chase cadence settings. */
function CadencePage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(),
  });

  const accountQuery = useQuery({
    queryKey: selectedAccountId
      ? accountsQueryKeys.detail(selectedAccountId)
      : ["account-detail-disabled"],
    queryFn: () => (selectedAccountId ? getAccount(selectedAccountId) : null),
    enabled: selectedAccountId !== null,
  });

  const detail = selectedAccountId ? accountQuery.data : undefined;
  const s = detail?.settings;

  const [mode, setMode] = useState<ChaseMode>("default");
  const [steps, setSteps] = useState<CadenceStep[]>([]);
  const [stopReason, setStopReason] = useState<ChaseStopReason | "">("" as ChaseStopReason | "");
  const [stopNote, setStopNote] = useState("");
  const [windowMode, setWindowMode] = useState<"default" | "custom">("default");
  const [opensAt, setOpensAt] = useState("09:00");
  const [closesAt, setClosesAt] = useState("17:00");
  const [days, setDays] = useState<Weekday[]>([]);
  const initialRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    if (s) {
      const snapshot: Snapshot = {
        mode: s.chase_mode,
        steps: s.steps,
        stopReason: (s.stop_reason ?? "") as ChaseStopReason | "",
        stopNote: s.stop_note ?? "",
        windowMode: s.send_window_mode,
        opensAt: s.send_window.opens_at,
        closesAt: s.send_window.closes_at,
        days: s.send_window.days,
      };
      setMode(snapshot.mode);
      setSteps(snapshot.steps);
      setStopReason(snapshot.stopReason);
      setStopNote(snapshot.stopNote);
      setWindowMode(snapshot.windowMode);
      setOpensAt(snapshot.opensAt);
      setClosesAt(snapshot.closesAt);
      setDays(snapshot.days);
      initialRef.current = snapshot;
    }
  }, [s]);

  const save = useUpdateChasingSettings(selectedAccountId || "");

  const defaultByKey = useMemo(
    () => Object.fromEntries((s?.default_steps || []).map((d) => [d.key, d])),
    [s?.default_steps],
  );

  const diffCount = useMemo(
    () =>
      steps.filter((step) => {
        const d = defaultByKey[step.key];
        return (
          d &&
          (step.tone !== d.tone || step.channel !== d.channel || step.recipients !== d.recipients)
        );
      }).length,
    [steps, defaultByKey],
  );

  const isModified =
    initialRef.current &&
    (mode !== initialRef.current.mode ||
      JSON.stringify(steps) !== JSON.stringify(initialRef.current.steps) ||
      stopReason !== initialRef.current.stopReason ||
      stopNote !== initialRef.current.stopNote ||
      windowMode !== initialRef.current.windowMode ||
      opensAt !== initialRef.current.opensAt ||
      closesAt !== initialRef.current.closesAt ||
      JSON.stringify(days) !== JSON.stringify(initialRef.current.days));

  const isOverride = s && (s.chase_mode !== "default" || s.send_window_mode !== "default");

  async function handleSave() {
    if (!selectedAccountId || !s || !detail) return;

    try {
      await save.mutateAsync({
        body: {
          chase_mode: mode,
          steps: mode === "custom" ? steps : undefined,
          stop_reason: mode === "stopped" ? (stopReason as ChaseStopReason) : null,
          stop_note: mode === "stopped" ? stopNote || null : null,
          send_window_mode: windowMode,
          send_window:
            windowMode === "custom" ? { opens_at: opensAt, closes_at: closesAt, days } : undefined,
          terms_preset: s.terms_preset,
          term_days: s.term_days,
          is_msme: s.is_msme,
          tds_section: s.tds_section,
          tds_rate: s.tds_rate,
          owner_user_id: s.owner_user_id,
          notes: s.notes,
        },
        ifMatch: detail.updated_at,
      });
      toast.success("Cadence saved");
      if (initialRef.current) {
        initialRef.current = {
          mode,
          steps,
          stopReason,
          stopNote,
          windowMode,
          opensAt,
          closesAt,
          days,
        };
      }
    } catch {
      // useUpdateChasingSettings already shows the error toast.
    }
  }

  async function handleResetToDefault() {
    if (!selectedAccountId || !s || !detail) return;

    try {
      await save.mutateAsync({
        body: {
          chase_mode: "default",
          send_window_mode: "default",
          terms_preset: s.terms_preset,
          term_days: s.term_days,
          is_msme: s.is_msme,
          tds_section: s.tds_section,
          tds_rate: s.tds_rate,
          owner_user_id: s.owner_user_id,
          notes: s.notes,
        },
        ifMatch: detail.updated_at,
      });
      toast.success("Reset to default cadence");
      setResetConfirmOpen(false);
      setMode("default");
    } catch {
      // useUpdateChasingSettings already shows the error toast.
    }
  }

  const accounts = accountsQuery.data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-soft">
            Editing
          </span>
          <select
            value={selectedAccountId || "default"}
            onChange={(e) =>
              setSelectedAccountId(e.target.value === "default" ? null : e.target.value)
            }
            className="min-w-80 rounded-lg border border-hairline bg-card px-3 py-2 text-body font-semibold text-fg"
          >
            <option value="default">Default cadence</option>
            {accounts.map((account) => (
              <option key={account.account_id} value={account.account_id}>
                {account.name}
              </option>
            ))}
          </select>
          {isOverride && (
            <>
              <span className="inline-block rounded-full bg-danger-tint px-2.5 py-1 text-xs font-semibold text-danger">
                Override
              </span>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                className="text-body font-semibold text-accent hover:text-accent-strong"
              >
                Reset to default
              </button>
            </>
          )}
        </div>
        <Link
          to="/app/chasing/overrides"
          className="rounded-lg border border-hairline bg-card px-4 py-2 text-body font-semibold text-fg hover:bg-hovered"
        >
          Manage overrides
        </Link>
      </div>

      {selectedAccountId && accountQuery.isError ? (
        <div className="flex flex-col items-start gap-3 py-10">
          <p className="text-body font-semibold text-fg">
            {accountQuery.error instanceof Error
              ? accountQuery.error.message
              : "Couldn't load account settings."}
          </p>
          <AppButton
            variant="secondary"
            onClick={() => {
              void accountQuery.refetch();
            }}
          >
            Retry
          </AppButton>
        </div>
      ) : selectedAccountId && !s ? (
        <div className="py-8 text-center text-prose text-fg-soft">Loading account...</div>
      ) : !s ? (
        <div className="py-8 text-center text-prose text-fg-soft">
          Select an account to view its cadence
        </div>
      ) : (
        <div className="space-y-5">
          {/* Chasing mode selector */}
          <div className="rounded-card border border-hairline bg-card p-5">
            <h2 className="text-section font-bold tracking-tight text-fg">Chasing mode</h2>
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="mode"
                  value="default"
                  checked={mode === "default"}
                  onChange={(e) => setMode(e.target.value as ChaseMode)}
                  className="size-4 accent-accent"
                />
                <div>
                  <div className="text-body font-semibold text-fg">Use default cadence</div>
                  <p className="text-prose text-fg-soft">
                    Follow the organization's cadence for this account.
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="mode"
                  value="custom"
                  checked={mode === "custom"}
                  onChange={(e) => setMode(e.target.value as ChaseMode)}
                  className="size-4 accent-accent"
                />
                <div>
                  <div className="text-body font-semibold text-fg">Custom cadence</div>
                  <p className="text-prose text-fg-soft">
                    Set a different cadence for this account.
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="mode"
                  value="stopped"
                  checked={mode === "stopped"}
                  onChange={(e) => setMode(e.target.value as ChaseMode)}
                  className="size-4 accent-accent"
                />
                <div>
                  <div className="text-body font-semibold text-fg">Stop chasing</div>
                  <p className="text-prose text-fg-soft">
                    Don't send chasing messages for this account.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Cadence steps for default and custom modes */}
          {mode !== "stopped" ? (
            <div className="rounded-card border border-hairline bg-card p-5">
              <h2 className="text-section font-bold tracking-tight text-fg">Cadence steps</h2>
              <ol className="mt-4 flex flex-col gap-2">
                {steps.map((step) => {
                  const defaultStep = defaultByKey[step.key] ?? step;
                  return (
                    <CadenceStepEditor
                      key={step.key}
                      step={step}
                      defaultStep={defaultStep}
                      disabled={mode === "default"}
                      onChange={(patch) =>
                        setSteps((prev) =>
                          prev.map((x) => (x.key === step.key ? { ...x, ...patch } : x)),
                        )
                      }
                    />
                  );
                })}
              </ol>
              {mode === "custom" && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-prose font-normal text-fg-muted">
                    {diffCount === 0
                      ? "No steps differ from the default yet"
                      : `${diffCount} ${diffCount === 1 ? "step differs" : "steps differ"} from the default`}
                  </p>
                  <AppButton
                    variant="text"
                    disabled={diffCount === 0}
                    onClick={() => setSteps(s?.default_steps || [])}
                  >
                    Reset to default
                  </AppButton>
                </div>
              )}
            </div>
          ) : null}

          {/* Stop reason for stopped mode */}
          {mode === "stopped" ? (
            <div className="rounded-card border border-hairline bg-card p-5">
              <h2 className="text-section font-bold tracking-tight text-fg">Reason for stopping</h2>
              <div className="mt-4 space-y-3">
                <div>
                  <label htmlFor="stop-reason" className="text-body font-semibold text-fg">
                    Reason (required)
                  </label>
                  <select
                    id="stop-reason"
                    value={stopReason}
                    onChange={(e) => setStopReason(e.target.value as ChaseStopReason)}
                    className="mt-2 w-full rounded-lg border border-hairline bg-card px-3 py-2 text-body font-semibold text-fg"
                  >
                    <option value="">Select a reason...</option>
                    {STOP_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="stop-note" className="text-body font-semibold text-fg">
                    Additional notes (optional)
                  </label>
                  <textarea
                    id="stop-note"
                    value={stopNote}
                    onChange={(e) => setStopNote(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-lg border border-hairline bg-card px-3 py-2 text-body font-semibold text-fg"
                    placeholder="e.g., dispute settled, payment plan started..."
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Send window */}
          <div className="rounded-card border border-hairline bg-card p-5">
            <h2 className="text-section font-bold tracking-tight text-fg">Send window</h2>
            <p className="mt-1 text-prose text-fg-soft">
              Messages queued outside this window send at the next opening.
            </p>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <select
                    value={opensAt}
                    onChange={(e) => setOpensAt(e.target.value)}
                    className="rounded-lg border border-hairline bg-card px-2 py-1 text-body font-semibold text-fg"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {formatTime(t)}
                      </option>
                    ))}
                  </select>
                  <span className="text-prose text-fg-soft">to</span>
                  <select
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="rounded-lg border border-hairline bg-card px-2 py-1 text-body font-semibold text-fg"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {formatTime(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-body font-semibold text-fg">Days messages may send</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day])
                      }
                      className={`rounded-full px-3 py-1.5 text-body font-semibold transition-colors ${
                        days.includes(day)
                          ? "bg-accent text-white"
                          : "border border-hairline bg-card text-fg hover:bg-hovered"
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stop on payment indicator */}
          <div className="rounded-card border border-hairline bg-card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-body font-semibold text-fg">
                  Stop the whole sequence when paid
                </div>
                <p className="mt-1 text-prose text-fg-soft">
                  Chasing stops immediately if the invoice is paid, regardless of cadence step.
                </p>
              </div>
              <span className="inline-block rounded-full bg-accent-tint px-3 py-1 text-pill font-semibold text-accent">
                Always on
              </span>
            </div>
          </div>

          {/* Save buttons */}
          <div className="flex justify-end gap-2">
            <AppButton
              variant="secondary"
              onClick={() => {
                if (initialRef.current) {
                  setMode(initialRef.current.mode);
                  setSteps(initialRef.current.steps);
                  setStopReason(initialRef.current.stopReason);
                  setStopNote(initialRef.current.stopNote);
                  setWindowMode(initialRef.current.windowMode);
                  setOpensAt(initialRef.current.opensAt);
                  setClosesAt(initialRef.current.closesAt);
                  setDays(initialRef.current.days);
                }
              }}
              disabled={!isModified}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onClick={handleSave}
              disabled={!isModified || (mode === "stopped" && stopReason === "")}
              loading={save.isPending}
            >
              Save
            </AppButton>
          </div>
        </div>
      )}

      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="rounded-card border-hairline bg-card p-5 sm:max-w-[440px]">
          <DialogTitle className="text-section font-bold tracking-tight text-fg">
            Reset to default cadence?
          </DialogTitle>
          <DialogDescription className="mt-2 text-prose font-normal text-fg-soft">
            This account will use the organization's default cadence settings.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton variant="text" onClick={() => setResetConfirmOpen(false)}>
              Cancel
            </AppButton>
            <AppButton variant="primary" onClick={handleResetToDefault} loading={save.isPending}>
              Reset to default
            </AppButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
