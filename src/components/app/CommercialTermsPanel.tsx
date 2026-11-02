import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppCheckbox } from "@/components/app/AppCheckbox";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { AppSlider } from "@/components/app/AppSlider";
import { DataTable, type Column } from "@/components/app/DataTable";
import { QueryNotice } from "@/components/app/QueryNotice";
import { TonePill } from "@/components/app/TonePill";
import { formatINR, formatShortDate } from "@/lib/format";
import type {
  CommercialTerms,
  DiscountPolicy,
  FeePolicy,
  TermsRates,
} from "@/lib/schemas/commercial-terms";
import {
  commercialTermsQueryKeys,
  getCommercialTerms,
  updateDiscountPolicy,
  updateRates,
} from "@/lib/services/commercial-terms";
import {
  BANK_RATE_STALE_AFTER_DAYS,
  bankRateAgeDays,
  discountVerdict,
  formatPercent,
  formatRatePct,
  istDateOf,
  rateDescription,
  rateWorking,
  type DiscountVerdict,
} from "@/lib/services/commercial-terms-rules";
import { featureErrorMessage } from "@/lib/services/feature-api";
import { cn } from "@/lib/utils";

/**
 * Settings → Commercial terms: the rates interest is worked from, the interest
 * and discount policies accounts can be put on, and the discount calculator.
 *
 * The calculator is the point of the screen. Every tool lets you set "2% if
 * paid within 10 days"; this one shows what that costs against borrowing, live,
 * as the sliders move.
 */

/** The invoice the calculator prices its examples on. */
const EXAMPLE_PRINCIPAL = "480000.00";

/** Net terms the calculator can be worked on, in days. */
const NET_TERMS_OPTIONS = [30, 45, 60, 90] as const;

/** Tooltip for controls whose backend isn't built yet. */
const COMING_SOON = "Coming soon";

/** The Commercial terms settings panel. */
export function CommercialTermsPanel({ canEdit }: { canEdit: boolean }) {
  const termsQuery = useQuery({
    queryKey: commercialTermsQueryKeys.terms,
    queryFn: () => getCommercialTerms(),
    retry: false,
  });

  return (
    <div className="space-y-8" aria-busy={termsQuery.isPending || undefined}>
      <header>
        <h2 className="text-section font-bold tracking-tight text-fg">Commercial terms</h2>
        <p className="mt-1 text-prose text-fg-soft">
          Interest and discount policies you can attach to accounts. Interest is off until you
          switch it on for an account, and nothing reaches a customer without your approval.
        </p>
      </header>

      {termsQuery.isPending ? (
        <PanelSkeleton />
      ) : termsQuery.isError ? (
        <QueryNotice
          error={termsQuery.error}
          fallback="Couldn't load commercial terms."
          onRetry={() => void termsQuery.refetch()}
        />
      ) : (
        <TermsContent terms={termsQuery.data} canEdit={canEdit} />
      )}
    </div>
  );
}

/** Placeholder bars in the shape of the loaded panel. */
function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <AppSkeleton className="h-24 w-full" />
      <AppSkeleton className="h-40 w-full" />
      <AppSkeleton className="h-64 w-full" />
    </div>
  );
}

/** The loaded panel: rates, interest policies, discount policies, calculator. */
function TermsContent({ terms, canEdit }: { terms: CommercialTerms; canEdit: boolean }) {
  const asOf = istDateOf(terms.as_of);
  const firstDiscount = terms.discount_policies[0];

  return (
    <>
      <RatesCard rates={terms.rates} asOf={asOf} canEdit={canEdit} />

      <section className="space-y-3" aria-labelledby="interest-policies">
        <div>
          <h3 id="interest-policies" className="text-body font-semibold text-fg">
            Late payment interest
          </h3>
          <p className="mt-1 text-prose text-fg-soft">
            Interest accrues for your visibility only. It is never added to an invoice until you
            approve a debit note.
          </p>
        </div>
        <div className="overflow-hidden rounded-card border border-hairline bg-card">
          <DataTable
            columns={feePolicyColumns(terms.rates.bank_rate_pct)}
            rows={terms.fee_policies}
            rowKey={(row) => row.policy_id}
          />
        </div>
        <AppButton variant="secondary" disabled title={COMING_SOON}>
          New interest policy
        </AppButton>
      </section>

      <section className="space-y-3" aria-labelledby="discount-policies">
        <div>
          <h3 id="discount-policies" className="text-body font-semibold text-fg">
            Early payment discounts
          </h3>
          <p className="mt-1 text-prose text-fg-soft">
            A discount must be agreed with the customer before the invoice is issued. Each one
            leaves as a credit note.
          </p>
        </div>
        <div className="overflow-hidden rounded-card border border-hairline bg-card">
          <DataTable
            columns={DISCOUNT_COLUMNS}
            rows={terms.discount_policies}
            rowKey={(row) => row.policy_id}
          />
        </div>
        {firstDiscount ? (
          <DiscountEditor
            // Keyed by the saved values, so a save that changes them resets
            // the editor to what the server now holds.
            key={`${firstDiscount.policy_id}-${firstDiscount.discount_pct}-${firstDiscount.window_days}-${firstDiscount.pre_agreed}-${firstDiscount.active}`}
            policy={firstDiscount}
            costOfCapitalPct={terms.rates.cost_of_capital_pct}
            canEdit={canEdit}
          />
        ) : null}
      </section>
    </>
  );
}

/** Columns for the interest policy table. */
function feePolicyColumns(bankRatePct: number): Column<FeePolicy>[] {
  return [
    { id: "name", header: "Policy", text: (row) => row.name },
    {
      id: "basis",
      header: "Basis",
      cell: (row) =>
        row.basis === "msmed_s16" ? (
          <TonePill tone="green">Section 16</TonePill>
        ) : (
          <TonePill>Contractual</TonePill>
        ),
    },
    {
      id: "rate",
      header: "Rate",
      cell: (row) => {
        const working = rateWorking(row, bankRatePct);
        return (
          <span className="block">
            <span className="block">{rateDescription(row, bankRatePct)}</span>
            {working ? (
              <span className="block text-eyebrow font-normal text-fg-muted">{working}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "grace",
      header: "Grace",
      text: (row) =>
        row.basis === "msmed_s16" || row.grace_days === 0 ? "—" : `${row.grace_days} days`,
    },
    {
      id: "accounts",
      header: "Accounts",
      align: "right",
      text: (row) => String(row.account_count),
    },
  ];
}

const DISCOUNT_COLUMNS: Column<DiscountPolicy>[] = [
  { id: "name", header: "Policy", text: (row) => row.name },
  { id: "discount", header: "Discount", text: (row) => formatPercent(row.discount_pct) },
  { id: "window", header: "Window", text: (row) => `within ${row.window_days} days` },
  {
    id: "pre-agreed",
    header: "Pre-agreed",
    cell: (row) =>
      row.pre_agreed ? <TonePill tone="green">Yes</TonePill> : <TonePill tone="warn">No</TonePill>,
  },
  { id: "accounts", header: "Accounts", align: "right", text: (row) => String(row.account_count) },
];

/** The bank rate and cost of capital, with when the bank rate was last confirmed. */
function RatesCard({
  rates,
  asOf,
  canEdit,
}: {
  rates: TermsRates;
  asOf: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const age = bankRateAgeDays(rates.bank_rate_as_of, asOf);
  const stale = age > BANK_RATE_STALE_AFTER_DAYS;

  return (
    <section className="rounded-card border border-hairline bg-card" aria-label="Rate basis">
      <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <p className="text-body font-semibold text-fg">RBI bank rate</p>
          <p className="mt-1 text-prose text-fg-soft">
            Drives the statutory rate under Section 16. Verify the current rate on rbi.org.in.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-section font-bold text-fg">
            {formatRatePct(rates.bank_rate_pct)}
          </p>
          <p className="mt-1 flex items-center justify-end gap-2 text-prose text-fg-muted">
            as of {formatShortDate(rates.bank_rate_as_of)}
            <TonePill tone={stale ? "warn" : "neutral"}>
              {age === 1 ? "1 day old" : `${age} days old`}
            </TonePill>
          </p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="text-body font-semibold text-fg">Your cost of capital</p>
          <p className="mt-1 text-prose text-fg-soft">
            What borrowing costs you. Used to check whether a discount is cheaper.
          </p>
        </div>
        <p className="tnum shrink-0 text-section font-bold text-fg">
          {formatPercent(rates.cost_of_capital_pct)} p.a.
        </p>
      </div>
      <div className="border-t border-hairline px-5 py-3">
        <AppButton
          variant="secondary"
          disabled={!canEdit}
          title={canEdit ? undefined : "Only owners and admins can change these settings."}
          onClick={() => setEditing(true)}
        >
          Update rates
        </AppButton>
      </div>
      <RatesDialog open={editing} onOpenChange={setEditing} rates={rates} />
    </section>
  );
}

/** Validates a percentage typed into a rates field. */
function parsePct(value: string): number | null {
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(value.trim())) return null;
  return Number(value);
}

/** Edits the bank rate, its date, and the cost of capital. */
function RatesDialog({
  open,
  onOpenChange,
  rates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rates: TermsRates;
}) {
  const queryClient = useQueryClient();
  const ids = { bank: useId(), date: useId(), coc: useId(), error: useId() };
  const [bank, setBank] = useState(String(rates.bank_rate_pct));
  const [date, setDate] = useState(rates.bank_rate_as_of);
  const [coc, setCoc] = useState(String(rates.cost_of_capital_pct));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: updateRates,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: commercialTermsQueryKeys.all });
      toast("Rates updated");
      onOpenChange(false);
    },
    onError: (err) => setError(featureErrorMessage(err, "Couldn't update the rates.")),
  });

  /** Checks the three fields and submits them. */
  function save() {
    const bankPct = parsePct(bank);
    const cocPct = parsePct(coc);
    if (bankPct === null || cocPct === null) {
      setError("Enter each rate as a percentage, like 5.5 or 13.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Enter the date the bank rate took effect.");
      return;
    }
    setError(null);
    mutation.mutate({ bank_rate_pct: bankPct, bank_rate_as_of: date, cost_of_capital_pct: cocPct });
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-fg/35" />
        <DialogPrimitive.Content className="app-theme app-shell fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card bg-card p-6 shadow-overlay">
          <DialogPrimitive.Title className="text-section font-bold tracking-tight text-fg">
            Update rates
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-prose text-fg-soft">
            Statutory interest on every account with Section 16 switched on is recalculated from
            these.
          </DialogPrimitive.Description>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <RateField id={ids.bank} label="RBI bank rate (%)" value={bank} onChange={setBank} />
            <div>
              <label
                htmlFor={ids.date}
                className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
              >
                Effective from
              </label>
              <input
                id={ids.date}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="field mt-1.5"
              />
            </div>
            <RateField id={ids.coc} label="Cost of capital (%)" value={coc} onChange={setCoc} />
          </div>
          {error ? (
            <p id={ids.error} role="alert" className="mt-4 text-prose text-danger">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <AppButton variant="secondary">Cancel</AppButton>
            </DialogPrimitive.Close>
            <AppButton loading={mutation.isPending} onClick={save}>
              Save rates
            </AppButton>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** One labelled percentage input. */
function RateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field tnum mt-1.5"
      />
    </div>
  );
}

/**
 * The discount policy editor: two sliders, the Section 15(3)(b) gate, and the
 * live verdict against the cost of capital — shown beside the 2% case (or 1%,
 * when 2% is the current setting), so the contrast is the argument.
 */
function DiscountEditor({
  policy,
  costOfCapitalPct,
  canEdit,
}: {
  policy: DiscountPolicy;
  costOfCapitalPct: number;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const netId = useId();
  const [discountPct, setDiscountPct] = useState(policy.discount_pct);
  const [windowDays, setWindowDays] = useState(policy.window_days);
  const [preAgreed, setPreAgreed] = useState(policy.pre_agreed);
  const [active, setActive] = useState(policy.active);
  const [netDays, setNetDays] = useState<number>(45);

  const dirty =
    discountPct !== policy.discount_pct ||
    windowDays !== policy.window_days ||
    preAgreed !== policy.pre_agreed ||
    active !== policy.active;

  const mutation = useMutation({
    mutationFn: () =>
      updateDiscountPolicy(policy.policy_id, {
        discount_pct: discountPct,
        window_days: windowDays,
        pre_agreed: preAgreed,
        active,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: commercialTermsQueryKeys.all });
      toast(`${policy.name} saved`);
    },
    onError: (err) => toast(featureErrorMessage(err, "Couldn't save the discount policy.")),
  });

  const comparePct = discountPct === 2 ? 1 : 2;
  const current = discountVerdict({
    principal: EXAMPLE_PRINCIPAL,
    discountPct,
    windowDays,
    netDays,
    costOfCapitalPct,
  });
  const compare = discountVerdict({
    principal: EXAMPLE_PRINCIPAL,
    discountPct: comparePct,
    windowDays,
    netDays,
    costOfCapitalPct,
  });

  return (
    <div className="rounded-card border border-hairline bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-semibold text-fg">{policy.name}</p>
        <label className="flex cursor-pointer items-center gap-2 text-prose text-fg-soft">
          <AppCheckbox
            checked={active}
            onCheckedChange={(next) => setActive(next === true)}
            aria-label="Policy active"
          />
          Active
        </label>
      </div>

      <div className="mt-5 grid gap-5">
        <SliderRow
          label="Discount"
          value={discountPct}
          valueText={formatPercent(discountPct)}
          min={0.5}
          max={5}
          step={0.5}
          onChange={setDiscountPct}
          disabled={!canEdit}
        />
        <SliderRow
          label="Qualifying window"
          value={windowDays}
          valueText={`${windowDays} days`}
          min={5}
          max={30}
          step={1}
          onChange={setWindowDays}
          disabled={!canEdit}
        />
        <div className="flex items-center gap-4">
          <label htmlFor={netId} className="w-40 shrink-0 text-body font-semibold text-fg">
            Net terms
          </label>
          <div className="flex items-center gap-3">
            <select
              id={netId}
              value={netDays}
              onChange={(event) => setNetDays(Number(event.target.value))}
              className="field w-auto"
            >
              {NET_TERMS_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
            </select>
            <span className="text-prose text-fg-soft">
              Each account&apos;s own payment terms apply in practice.
            </span>
          </div>
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3">
        <AppCheckbox
          checked={preAgreed}
          onCheckedChange={(next) => setPreAgreed(next === true)}
          aria-label="Agreed with the customer before the invoice was issued"
          className="mt-0.5"
        />
        <span>
          <span className="block text-body font-semibold text-fg">
            These terms were agreed with the customer before the invoice was issued
          </span>
          <span className="mt-1 block text-prose text-fg-soft">
            Required under Section 15(3)(b) of the CGST Act. Without prior agreement this is a
            write-off, not a discount — it will be offered as a settlement instead.
          </span>
        </span>
      </label>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <VerdictPanel
          label={`At ${formatPercent(discountPct)} · current setting`}
          verdict={current}
        />
        <VerdictPanel label={`At ${formatPercent(comparePct)}`} verdict={compare} />
      </div>

      <p className="mt-4 text-eyebrow font-normal text-fg-muted">
        Implied cost = discount ÷ (100 − discount) × 365 ÷ days sooner. Overdraft cost ={" "}
        {formatINR(EXAMPLE_PRINCIPAL)} × {formatPercent(costOfCapitalPct)} × days sooner ÷ 365.
      </p>

      <div className="mt-5 flex justify-end">
        <AppButton
          disabled={!canEdit || !dirty}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          title={canEdit ? undefined : "Only owners and admins can change these settings."}
        >
          Save policy
        </AppButton>
      </div>
    </div>
  );
}

/** A labelled slider with its value read out beside it. */
function SliderRow({
  label,
  value,
  valueText,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  valueText: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-40 shrink-0 text-body font-semibold text-fg">{label}</span>
      <div className={cn("min-w-0 flex-1", disabled && "pointer-events-none opacity-50")}>
        <AppSlider
          value={value}
          min={min}
          max={max}
          step={step}
          onValueChange={onChange}
          aria-label={label}
          valueText={valueText}
        />
      </div>
      <span className="tnum w-18 shrink-0 text-right text-body font-semibold text-fg">
        {valueText}
      </span>
    </div>
  );
}

/** One verdict: implied cost against the cost of capital, and what it means in rupees. */
function VerdictPanel({ label, verdict }: { label: string; verdict: DiscountVerdict | null }) {
  if (verdict === null) {
    return (
      <div className="rounded-card bg-subtle p-5">
        <p className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
          {label}
        </p>
        <p className="mt-3 text-prose text-fg-soft">
          The window is as long as the terms, so there are no days of early payment to price.
        </p>
      </div>
    );
  }
  const tone = verdict.cheaper ? "bg-subtle" : "bg-danger-tint";
  return (
    <div className={cn("rounded-card p-5", tone)}>
      <p className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">{label}</p>
      <dl className="tnum mt-3 space-y-2 text-body">
        <div className="flex justify-between">
          <dt className="font-normal text-fg-soft">Implied cost of capital</dt>
          <dd className="font-semibold text-fg">{formatPercent(verdict.impliedPct)} p.a.</dd>
        </div>
        <div className="flex justify-between">
          <dt className="font-normal text-fg-soft">Your cost of capital</dt>
          <dd className="font-semibold text-fg">{formatPercent(verdict.costOfCapitalPct)} p.a.</dd>
        </div>
      </dl>
      <p
        className={cn(
          "mt-3 border-t border-stroke pt-3 text-body font-semibold",
          verdict.cheaper ? "text-accent" : "text-danger",
        )}
      >
        {verdict.cheaper ? "Cheaper than borrowing" : "More expensive than borrowing"}
      </p>
      <p className="mt-2 text-prose text-fg-soft">
        On a {formatINR(EXAMPLE_PRINCIPAL)} invoice you give up {formatINR(verdict.givenUp)} to be
        paid {verdict.daysSooner} days sooner.{" "}
        {verdict.cheaper
          ? `That is ${formatINR(verdict.difference)} less than an overdraft at ${formatPercent(verdict.costOfCapitalPct)}.`
          : `An overdraft at ${formatPercent(verdict.costOfCapitalPct)} would cost ${formatINR(verdict.difference)} less.`}
      </p>
    </div>
  );
}
