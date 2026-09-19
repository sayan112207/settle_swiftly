import { useMemo, useRef, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";

import { AppButton } from "@/components/app/AppButton";
import { CadenceStepEditor } from "@/components/app/CadenceStepEditor";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatINR } from "@/lib/format";
import {
  useArchiveAccount,
  useResumeAccount,
  useUpdateChasingSettings,
} from "@/lib/queries/account-detail";
import { chaseStopReasonSchema, tdsSectionSchema, weekdaySchema } from "@/lib/schemas/accounts";
import type {
  AccountDetail,
  CadenceStep,
  ChaseMode,
  ChaseStopReason,
  PaymentTermsPreset,
  TdsSection,
  Weekday,
} from "@/lib/schemas/accounts";
import { AccountsApiError } from "@/lib/services/accounts";

type Props = {
  accountId: string;
  detail: AccountDetail;
};

const STOP_REASONS = chaseStopReasonSchema.options;
const WEEKDAYS = weekdaySchema.options;
const TDS_SECTIONS = tdsSectionSchema.options;

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

const accountDetailRoute = getRouteApi("/app/accounts/$accountId");

function formatTime(value: string) {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** The Settings tab: cadence, send window, terms, ownership and archive. Locked while paused, archived, or for non-admins. */
export function AccountSettingsPanel({ accountId, detail }: Props) {
  const s = detail.settings;
  const navigate = accountDetailRoute.useNavigate();

  const [mode, setMode] = useState<ChaseMode>(s.chase_mode);
  const [steps, setSteps] = useState<CadenceStep[]>(s.steps);
  const [stopReason, setStopReason] = useState<ChaseStopReason | "">(s.stop_reason ?? "");
  const [stopNote, setStopNote] = useState(s.stop_note ?? "");
  const [windowMode, setWindowMode] = useState(s.send_window_mode);
  const [opensAt, setOpensAt] = useState(s.send_window.opens_at);
  const [closesAt, setClosesAt] = useState(s.send_window.closes_at);
  const [days, setDays] = useState<Weekday[]>(s.send_window.days);
  const [termsPreset, setTermsPreset] = useState(s.terms_preset);
  // `number | undefined`, not `number`: `Number("")` is 0, so coercing directly
  // turns a cleared field into a real zero, which `term_days: positive()` only
  // rejects at submit and which reads as "0 day terms" until then. A typed 0
  // still comes through as 0 and is still rejected — the difference is that an
  // empty field stays empty.
  const [termDays, setTermDays] = useState<number | undefined>(s.term_days);
  const [isMsme, setIsMsme] = useState(s.is_msme);
  const [tdsSection, setTdsSection] = useState<TdsSection>(s.tds_section);
  const [tdsRate, setTdsRate] = useState<number | null>(s.tds_rate);
  const [ownerId, setOwnerId] = useState(s.owner_user_id ?? "");
  const [notes, setNotes] = useState(s.notes ?? "");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [baselineRevision, setBaselineRevision] = useState(0);
  const initialRef = useRef<SettingsSnapshot>(snapshotFromSettings(s));

  const save = useUpdateChasingSettings(accountId);
  const resume = useResumeAccount(accountId);

  const isArchived = s.archived_at !== null;
  const isPaused = !isArchived && s.paused_at !== null;
  const canEdit = s.can_edit;
  // An archived account is read-only until restored (the page banner has Restore).
  const locked = isArchived || isPaused || !canEdit;

  const defaultByKey = useMemo(
    () => Object.fromEntries(s.default_steps.map((d) => [d.key, d])),
    [s.default_steps],
  );

  const diffCount = steps.filter((step) => {
    const d = defaultByKey[step.key];
    return (
      d && (step.tone !== d.tone || step.channel !== d.channel || step.recipients !== d.recipients)
    );
  }).length;

  const reasonMissing = mode === "stopped" && reasonTouched && !stopReason;

  const isDirty = useMemo(() => {
    void baselineRevision;
    return !snapshotsEqual(
      {
        mode,
        steps,
        stopReason,
        stopNote,
        windowMode,
        opensAt,
        closesAt,
        days,
        termsPreset,
        termDays,
        isMsme,
        tdsSection,
        tdsRate,
        ownerId,
        notes,
      },
      initialRef.current,
    );
  }, [
    baselineRevision,
    mode,
    steps,
    stopReason,
    stopNote,
    windowMode,
    opensAt,
    closesAt,
    days,
    termsPreset,
    termDays,
    isMsme,
    tdsSection,
    tdsRate,
    ownerId,
    notes,
  ]);

  const submit = () => {
    if (mode === "stopped" && !stopReason) {
      setReasonTouched(true);
      return;
    }
    // Save is disabled while this is empty; the guard is here so the body below
    // cannot be built from a missing value even if that gate ever moves.
    if (termDays === undefined) return;
    save.mutate(
      {
        body: {
          chase_mode: mode,
          steps: mode === "custom" ? steps : undefined,
          stop_reason: mode === "stopped" ? (stopReason as ChaseStopReason) : null,
          stop_note: mode === "stopped" ? stopNote || null : null,
          send_window_mode: windowMode,
          send_window:
            windowMode === "custom" ? { opens_at: opensAt, closes_at: closesAt, days } : undefined,
          terms_preset: termsPreset,
          term_days: termDays,
          is_msme: isMsme,
          tds_section: tdsSection,
          tds_rate: tdsSection === "None" ? null : tdsRate,
          owner_user_id: ownerId || null,
          notes: notes || null,
        },
        ifMatch: detail.updated_at,
      },
      {
        onSuccess: () => {
          initialRef.current = {
            mode,
            steps: cloneSteps(steps),
            stopReason,
            stopNote,
            windowMode,
            opensAt,
            closesAt,
            days: [...days],
            termsPreset,
            termDays,
            isMsme,
            tdsSection,
            tdsRate,
            ownerId,
            notes,
          };
          setBaselineRevision((revision) => revision + 1);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {isPaused ? (
        <div className="flex items-center justify-between gap-4 rounded-card border border-warn-edge bg-warn-tint px-4 py-3">
          <p className="text-body font-semibold text-warn">
            Chasing is paused for this account. Resume to edit.
          </p>
          <AppButton
            variant="secondary"
            loading={resume.isPending}
            onClick={() => resume.mutate({ ifMatch: detail.updated_at })}
          >
            Resume chasing
          </AppButton>
        </div>
      ) : null}

      {!canEdit ? (
        <div className="rounded-card border border-hairline bg-subtle px-4 py-3">
          <p className="text-body font-semibold text-fg-soft">
            You need admin access to change chasing settings.
          </p>
        </div>
      ) : null}

      <div className={locked ? "pointer-events-none opacity-55" : undefined}>
        <div className="flex flex-col gap-6">
          {/* ── Chasing cadence ─────────────────────────────────────────── */}
          <section className="rounded-card border border-hairline bg-card p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-section font-bold tracking-tight text-fg">Chasing cadence</h2>
              {mode === "custom" ? (
                <span className="rounded-pill bg-accent-tint px-2.5 py-0.5 text-pill font-semibold text-accent">
                  Custom cadence
                </span>
              ) : null}
            </div>

            <fieldset className="mt-4 border-0 p-0">
              <legend className="sr-only">Chasing cadence for {detail.name}</legend>
              <div className="flex flex-col gap-2">
                <ModeOption
                  name="chase-mode"
                  checked={mode === "default"}
                  onSelect={() => setMode("default")}
                  title="Use the default cadence"
                  description={s.default_summary}
                  disabled={locked}
                />
                <ModeOption
                  name="chase-mode"
                  checked={mode === "custom"}
                  onSelect={() => setMode("custom")}
                  title="Use a different cadence for this account"
                  description="Starts from the default. Edit only the steps you need."
                  disabled={locked}
                />
                <ModeOption
                  name="chase-mode"
                  checked={mode === "stopped"}
                  onSelect={() => {
                    setMode("stopped");
                    setReasonTouched(true);
                  }}
                  title="Don't chase this account"
                  description="No messages go out until you turn chasing back on."
                  disabled={locked}
                />
              </div>
            </fieldset>

            {mode === "custom" ? (
              <div className="mt-5">
                <ol className="flex flex-col gap-2">
                  {steps.map((step) => {
                    const defaultStep = defaultByKey[step.key] ?? step;
                    return (
                      <CadenceStepEditor
                        key={step.key}
                        step={step}
                        defaultStep={defaultStep}
                        disabled={locked}
                        onChange={(patch) =>
                          setSteps((prev) =>
                            prev.map((x) => (x.key === step.key ? { ...x, ...patch } : x)),
                          )
                        }
                      />
                    );
                  })}
                </ol>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-prose font-normal text-fg-muted">
                    {diffCount === 0
                      ? "No steps differ from the default yet"
                      : `${diffCount} ${diffCount === 1 ? "step differs" : "steps differ"} from the default`}
                  </p>
                  <AppButton
                    variant="text"
                    disabled={diffCount === 0}
                    onClick={() => setSteps(s.default_steps)}
                  >
                    Reset to default
                  </AppButton>
                </div>
              </div>
            ) : null}

            {mode === "stopped" ? (
              <div className="mt-5 flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="stop-reason"
                    className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                  >
                    Reason (required)
                  </label>
                  <select
                    id="stop-reason"
                    value={stopReason}
                    disabled={locked}
                    aria-invalid={reasonMissing}
                    aria-describedby={reasonMissing ? "stop-reason-error" : undefined}
                    onChange={(e) => {
                      setStopReason(e.target.value as ChaseStopReason);
                      setReasonTouched(true);
                    }}
                    className={`mt-1.5 w-full rounded-input border bg-card px-3 py-2 text-body font-semibold text-fg ${
                      reasonMissing ? "border-danger" : "border-stroke"
                    }`}
                  >
                    <option value="">Select a reason</option>
                    {STOP_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {reasonMissing ? (
                    <p
                      id="stop-reason-error"
                      role="alert"
                      className="mt-1.5 text-prose font-normal text-danger"
                    >
                      Pick a reason before saving.
                    </p>
                  ) : null}
                </div>

                <div>
                  <label
                    htmlFor="stop-note"
                    className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                  >
                    Note <span className="font-normal normal-case">(optional)</span>
                  </label>
                  <textarea
                    id="stop-note"
                    rows={2}
                    value={stopNote}
                    disabled={locked}
                    onChange={(e) => setStopNote(e.target.value)}
                    className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
                  />
                </div>
              </div>
            ) : null}
          </section>

          {/* ── Escalation contacts (read-only) ─────────────────────────── */}
          <section className="rounded-card border border-hairline bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-section font-bold tracking-tight text-fg">Escalation contacts</h2>
              <AppButton
                variant="text"
                onClick={() => {
                  void navigate({
                    search: (prev) => ({ ...prev, tab: "contacts" }),
                    replace: true,
                  });
                }}
              >
                Edit in Contacts
              </AppButton>
            </div>

            <ul className="mt-4 flex flex-col gap-2">
              {s.escalation_contacts.map((contact) => (
                <li
                  key={contact.tier}
                  className="flex items-baseline gap-3 rounded-input bg-subtle px-3 py-2.5"
                >
                  <span className="w-8 shrink-0 text-pill font-semibold text-fg-muted">
                    {contact.tier}
                  </span>
                  <span
                    className={`text-body font-semibold ${
                      contact.name ? "text-fg" : "text-fg-soft"
                    }`}
                  >
                    {contact.name ?? "No contact mapped"}
                  </span>
                  <span className="text-prose font-normal text-fg-muted">{contact.detail}</span>
                </li>
              ))}
            </ul>

            {s.escalation_contacts.some((c) => c.name === null) ? (
              <p className="mt-3 text-prose font-normal text-fg-muted">
                Escalation steps will fall back to P0.
              </p>
            ) : null}
          </section>

          {/* ── Send window ─────────────────────────────────────────────── */}
          <section className="rounded-card border border-hairline bg-card p-5">
            <h2 className="text-section font-bold tracking-tight text-fg">Send window</h2>

            <fieldset className="mt-4 border-0 p-0">
              <legend className="sr-only">Send window for this account</legend>
              <div className="flex flex-col gap-2">
                <ModeOption
                  name="window-mode"
                  checked={windowMode === "default"}
                  onSelect={() => setWindowMode("default")}
                  title="Use the default window"
                  description={`${formatTime(s.default_send_window.opens_at)} – ${formatTime(s.default_send_window.closes_at)}, ${s.default_send_window.days.join(", ")}`}
                  disabled={locked}
                />
                <ModeOption
                  name="window-mode"
                  checked={windowMode === "custom"}
                  onSelect={() => setWindowMode("custom")}
                  title="Set a different window for this account"
                  disabled={locked}
                />
              </div>
            </fieldset>

            {windowMode === "custom" ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-end gap-3">
                  <TimeSelect
                    id="window-open"
                    label="Send window opens at"
                    value={opensAt}
                    disabled={locked}
                    onChange={setOpensAt}
                  />
                  <span className="pb-2 text-prose font-normal text-fg-muted">to</span>
                  <TimeSelect
                    id="window-close"
                    label="Send window closes at"
                    value={closesAt}
                    disabled={locked}
                    onChange={setClosesAt}
                  />
                </div>

                <fieldset className="border-0 p-0">
                  <legend className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    Days
                  </legend>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => {
                      const on = days.includes(day);
                      return (
                        <label
                          key={day}
                          className={`cursor-pointer rounded-pill border px-3 py-1.5 text-pill font-semibold ${
                            on
                              ? "border-accent-edge bg-accent-tint text-accent"
                              : "border-stroke bg-card text-fg-soft"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={locked}
                            onChange={() =>
                              setDays((prev) =>
                                on ? prev.filter((d) => d !== day) : [...prev, day],
                              )
                            }
                            className="sr-only"
                          />
                          {day}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <p className="text-prose font-normal text-fg-muted">
                  Messages queued outside this window send at the next opening.
                </p>
              </div>
            ) : null}
          </section>

          {/* ── Account terms ───────────────────────────────────────────── */}
          <section className="rounded-card border border-hairline bg-card p-5">
            <h2 className="text-section font-bold tracking-tight text-fg">Account terms</h2>

            <div className="mt-4 flex flex-col gap-4">
              <div className="max-w-[240px]">
                <label
                  htmlFor="terms-preset"
                  className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                >
                  Payment terms
                </label>
                <select
                  id="terms-preset"
                  value={termsPreset}
                  disabled={locked}
                  onChange={(e) => {
                    const next = e.target.value as typeof termsPreset;
                    setTermsPreset(next);
                    if (next === "net_30") setTermDays(30);
                    if (next === "net_45") setTermDays(45);
                  }}
                  className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
                >
                  <option value="net_30">Net 30</option>
                  <option value="net_45">Net 45</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {termsPreset === "custom" ? (
                <div className="max-w-[240px]">
                  <label
                    htmlFor="term-days"
                    className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                  >
                    Days
                  </label>
                  <input
                    id="term-days"
                    type="number"
                    min={1}
                    max={365}
                    value={termDays ?? ""}
                    disabled={locked}
                    onChange={(e) => {
                      const next = e.target.valueAsNumber;
                      setTermDays(Number.isFinite(next) ? next : undefined);
                    }}
                    className="tnum mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
                  />
                </div>
              ) : null}

              <div className="flex gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="tds-section"
                    className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                  >
                    Expected TDS section
                  </label>
                  <select
                    id="tds-section"
                    value={tdsSection}
                    disabled={locked}
                    onChange={(e) => setTdsSection(e.target.value as TdsSection)}
                    className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
                  >
                    {TDS_SECTIONS.map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label
                    htmlFor="tds-rate"
                    className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                  >
                    Expected TDS rate (%)
                  </label>
                  <input
                    id="tds-rate"
                    type="number"
                    min={0}
                    max={30}
                    step={0.5}
                    value={tdsRate ?? ""}
                    disabled={locked || tdsSection === "None"}
                    onChange={(e) =>
                      setTdsRate(e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="tnum mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg disabled:opacity-55"
                  />
                </div>
              </div>

              <p className="text-prose font-normal text-fg-muted">
                Receivables are carried gross. TDS fields record what to expect at payment time;
                they never reduce the outstanding figure.
              </p>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={isMsme}
                  disabled={locked}
                  onChange={(e) => setIsMsme(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  <span className="block text-body font-semibold text-fg">
                    Treat as MSME (43B(h))
                  </span>
                  <span className="block text-prose font-normal text-fg-muted">
                    Adds the 45-day statutory reference to firm messages.
                  </span>
                </span>
              </label>
            </div>
          </section>

          {/* ── Ownership and notes ─────────────────────────────────────── */}
          <section className="rounded-card border border-hairline bg-card p-5">
            <h2 className="text-section font-bold tracking-tight text-fg">Ownership and notes</h2>

            <div className="mt-4 flex flex-col gap-4">
              <div className="max-w-[280px]">
                <label
                  htmlFor="account-owner"
                  className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                >
                  Account owner
                </label>
                <select
                  id="account-owner"
                  value={ownerId}
                  disabled={locked}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
                >
                  <option value="">Unassigned</option>
                  {s.assignable_owners.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="account-notes"
                  className="text-eyebrow font-semibold uppercase tracking-[0.08em] text-fg-muted"
                >
                  Notes <span className="font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  id="account-notes"
                  rows={3}
                  value={notes}
                  disabled={locked}
                  placeholder="Context for whoever picks this account up next."
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1.5 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg placeholder:font-normal placeholder:text-fg-muted"
                />
              </div>
            </div>
          </section>

          {save.error ? (
            <p role="alert" className="text-prose font-normal text-danger">
              {save.error instanceof AccountsApiError
                ? save.error.message
                : "Couldn't save settings."}
            </p>
          ) : null}

          <div className="flex justify-end">
            <AppButton
              variant="primary"
              loading={save.isPending}
              disabled={locked || !isDirty || termDays === undefined}
              onClick={submit}
            >
              Save changes
            </AppButton>
          </div>
        </div>
      </div>

      {/* ── Danger zone ───────────────────────────────────────────────── */}
      {isArchived ? null : (
        <section className="rounded-card border border-danger-edge bg-card p-5">
          <h2 className="text-section font-bold tracking-tight text-danger">Danger zone</h2>
          <p className="mt-2 text-prose font-normal text-fg-soft">
            Stops every reminder and moves this account to Accounts → Archived, out of your totals.
            Invoices and history are kept, and you can restore it at any time.
          </p>
          <div className="mt-3">
            <AppButton
              variant="destructive"
              disabled={!canEdit}
              onClick={() => setArchiveOpen(true)}
            >
              Stop all chasing and archive this account
            </AppButton>
          </div>
        </section>
      )}

      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        accountId={accountId}
        detail={detail}
      />
    </div>
  );
}

type SettingsSnapshot = {
  mode: ChaseMode;
  steps: CadenceStep[];
  stopReason: ChaseStopReason | "";
  stopNote: string;
  windowMode: "default" | "custom";
  opensAt: string;
  closesAt: string;
  days: Weekday[];
  termsPreset: PaymentTermsPreset;
  termDays: number | undefined;
  isMsme: boolean;
  tdsSection: TdsSection;
  tdsRate: number | null;
  ownerId: string;
  notes: string;
};

function cloneSteps(steps: CadenceStep[]): CadenceStep[] {
  return steps.map((step) => ({
    ...step,
    allowed_channels: [...step.allowed_channels],
  }));
}

function snapshotFromSettings(settings: AccountDetail["settings"]): SettingsSnapshot {
  return {
    mode: settings.chase_mode,
    steps: cloneSteps(settings.steps),
    stopReason: settings.stop_reason ?? "",
    stopNote: settings.stop_note ?? "",
    windowMode: settings.send_window_mode,
    opensAt: settings.send_window.opens_at,
    closesAt: settings.send_window.closes_at,
    days: [...settings.send_window.days],
    termsPreset: settings.terms_preset,
    termDays: settings.term_days,
    isMsme: settings.is_msme,
    tdsSection: settings.tds_section,
    tdsRate: settings.tds_rate,
    ownerId: settings.owner_user_id ?? "",
    notes: settings.notes ?? "",
  };
}

function stepsEqual(a: CadenceStep[], b: CadenceStep[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((step, index) => {
    const other = b[index];
    if (!other) return false;
    return (
      step.key === other.key &&
      step.tone === other.tone &&
      step.channel === other.channel &&
      step.recipients === other.recipients
    );
  });
}

function daysEqual(a: Weekday[], b: Weekday[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((day, index) => day === sortedB[index]);
}

function snapshotsEqual(current: SettingsSnapshot, initial: SettingsSnapshot): boolean {
  return (
    current.mode === initial.mode &&
    current.stopReason === initial.stopReason &&
    current.stopNote === initial.stopNote &&
    current.windowMode === initial.windowMode &&
    current.opensAt === initial.opensAt &&
    current.closesAt === initial.closesAt &&
    current.termsPreset === initial.termsPreset &&
    current.termDays === initial.termDays &&
    current.isMsme === initial.isMsme &&
    current.tdsSection === initial.tdsSection &&
    current.tdsRate === initial.tdsRate &&
    current.ownerId === initial.ownerId &&
    current.notes === initial.notes &&
    stepsEqual(current.steps, initial.steps) &&
    daysEqual(current.days, initial.days)
  );
}

function ModeOption({
  name,
  checked,
  onSelect,
  title,
  description,
  disabled,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  disabled: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-input border p-3 ${
        checked ? "border-accent-edge bg-accent-row" : "border-hairline bg-card"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
      />
      <span>
        <span className="block text-body font-semibold text-fg">{title}</span>
        {description ? (
          <span className="block text-prose font-normal text-fg-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

function TimeSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
      >
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {formatTime(t)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Confirms archiving by making the user type the account name; the server re-checks it. */
function ArchiveDialog({
  open,
  onOpenChange,
  accountId,
  detail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  detail: AccountDetail;
}) {
  const [typed, setTyped] = useState("");
  const archive = useArchiveAccount(accountId);
  const target = detail.name.toUpperCase();
  const ready = typed.trim().toUpperCase() === target;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-card border-hairline bg-card p-5 sm:max-w-[440px]">
        <DialogTitle className="text-section font-bold tracking-tight text-fg">
          Archive {detail.name}?
        </DialogTitle>
        <DialogDescription className="mt-2 text-prose font-normal text-fg-soft">
          {formatINR(detail.outstanding)} is still outstanding on this account. Archiving stops all
          chasing and takes it out of your totals until you restore it. Type{" "}
          <span className="font-semibold text-fg">{target}</span> to confirm.
        </DialogDescription>

        <label htmlFor="archive-confirm" className="sr-only">
          Type the account name to confirm archiving
        </label>
        <input
          id="archive-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-4 w-full rounded-input border border-stroke bg-card px-3 py-2 text-body font-semibold text-fg"
        />

        {archive.error ? (
          <p role="alert" className="mt-2 text-prose font-normal text-danger">
            {archive.error instanceof AccountsApiError
              ? archive.error.message
              : "Couldn't archive this account."}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <AppButton variant="text" onClick={() => onOpenChange(false)}>
            Cancel
          </AppButton>
          <AppButton
            variant="destructive"
            disabled={!ready}
            loading={archive.isPending}
            onClick={() =>
              archive.mutate(
                { body: { confirm_name: typed }, ifMatch: detail.updated_at },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Archive account
          </AppButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
