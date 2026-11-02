import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { QueryNotice } from "@/components/app/QueryNotice";
import { SidePanel } from "@/components/app/SidePanel";
import { TonePill } from "@/components/app/TonePill";
import { TypeToConfirmDialog } from "@/components/app/TypeToConfirmDialog";
import { formatINR, formatOverdueDays, formatShortDate } from "@/lib/format";
import type {
  CommercialTerms,
  CreateOfferBody,
  Offer,
  OfferKind,
} from "@/lib/schemas/commercial-terms";
import {
  commercialTermsQueryKeys,
  createOffer,
  getCommercialTerms,
  getInvoiceOffers,
} from "@/lib/services/commercial-terms";
import {
  addDays,
  basisLabel,
  daysBetween,
  formatAccrualPeriod,
  formatPercent,
  fromPaise,
  indexAccountTerms,
  invoiceInterest,
  istDateOf,
  settlementCheck,
  splitInstalments,
  toPaise,
  type InterestAccrual,
  type ResolvedAccountTerms,
} from "@/lib/services/commercial-terms-rules";
import { featureErrorMessage } from "@/lib/services/feature-api";
import { cn } from "@/lib/utils";

/**
 * The invoice offer sheet: waive interest, offer an early payment discount,
 * settle for less, or split into instalments.
 *
 * Every offer lands in the approval queue. Nothing here reaches a customer,
 * and nothing changes the invoice's value — accrued interest is shown beside
 * the outstanding amount, never added into it.
 */

export type OfferSheetInvoice = {
  invoice_id: string;
  invoice_number: string;
  account_id: string;
  account_name: string;
  /** What is still owed, as a money string. */
  outstanding: string;
  issue_date: string;
  due_date: string;
};

/** Plan instalments the stepper allows. */
const MIN_INSTALMENTS = 2;
const MAX_INSTALMENTS = 12;

/** Days from "as of" offered as a waiver deadline. */
const WAIVER_DEADLINES = [3, 10, 17] as const;

/** Copy for each offer kind's status chip. */
const KIND_LABEL: Record<OfferKind, string> = {
  interest_waiver: "Interest waiver",
  early_discount: "Early payment discount",
  settlement: "Settlement offer",
  payment_plan: "Payment plan",
};

/** The offer sheet for one invoice. */
export function InvoiceOfferSheet({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: OfferSheetInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <SidePanel
      open={open && invoice !== null}
      onOpenChange={onOpenChange}
      title={invoice?.invoice_number ?? "Offers"}
      description={invoice?.account_name}
      footer={
        <p className="text-prose text-fg-soft">
          Every offer goes to the approval queue before it&apos;s sent.
        </p>
      }
    >
      {invoice ? <SheetBody invoice={invoice} /> : null}
    </SidePanel>
  );
}

/** Loads the terms and the invoice's open offers, then renders the cards. */
function SheetBody({ invoice }: { invoice: OfferSheetInvoice }) {
  const termsQuery = useQuery({
    queryKey: commercialTermsQueryKeys.terms,
    queryFn: () => getCommercialTerms(),
    retry: false,
  });
  const offersQuery = useQuery({
    queryKey: commercialTermsQueryKeys.offers(invoice.invoice_id),
    queryFn: () => getInvoiceOffers(invoice.invoice_id),
    retry: false,
  });

  if (termsQuery.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <AppSkeleton className="h-16 w-full" />
        <AppSkeleton className="h-32 w-full" />
        <AppSkeleton className="h-32 w-full" />
      </div>
    );
  }
  if (termsQuery.isError) {
    return (
      <QueryNotice
        error={termsQuery.error}
        fallback="Couldn't load this invoice's terms."
        onRetry={() => void termsQuery.refetch()}
      />
    );
  }

  return <OfferCards invoice={invoice} terms={termsQuery.data} offers={offersQuery.data ?? []} />;
}

/** The summary and four offer cards, once the terms have loaded. */
function OfferCards({
  invoice,
  terms,
  offers,
}: {
  invoice: OfferSheetInvoice;
  terms: CommercialTerms;
  offers: Offer[];
}) {
  const asOf = istDateOf(terms.as_of);
  const resolved = indexAccountTerms(terms).get(invoice.account_id);
  const accrual = invoiceInterest({
    resolved,
    principal: invoice.outstanding,
    dueDate: invoice.due_date,
    asOf,
    bankRatePct: terms.rates.bank_rate_pct,
  });
  const daysOverdue = daysBetween(invoice.due_date, asOf);
  const settlementInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-5">
      <InvoiceSummary invoice={invoice} accrual={accrual} daysOverdue={daysOverdue} />

      {offers.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Open offers">
          {offers.map((offer) => (
            <li key={offer.offer_id}>
              <TonePill tone={offer.status === "awaiting_approval" ? "neutral" : "green"}>
                {KIND_LABEL[offer.kind]}{" "}
                {offer.status === "awaiting_approval" ? "awaiting approval" : offer.status}
              </TonePill>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">Offers</p>

      <WaiverCard invoice={invoice} accrual={accrual} asOf={asOf} />
      <DiscountCard
        invoice={invoice}
        resolved={resolved}
        asOf={asOf}
        onOfferSettlement={() => settlementInputRef.current?.focus()}
      />
      <SettlementCard invoice={invoice} inputRef={settlementInputRef} asOf={asOf} />
      <PlanCard invoice={invoice} asOf={asOf} />
    </div>
  );
}

/** The amount, how late it is, and any accrued interest — beside it, never in it. */
function InvoiceSummary({
  invoice,
  accrual,
  daysOverdue,
}: {
  invoice: OfferSheetInvoice;
  accrual: InterestAccrual | null;
  daysOverdue: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tnum text-title font-bold tracking-tight text-fg">
          {formatINR(invoice.outstanding)}
        </span>
        <span
          className={cn(
            "text-prose font-semibold",
            daysOverdue > 0 ? "text-danger" : "text-fg-muted",
          )}
        >
          {daysOverdue > 0 ? `${formatOverdueDays(daysOverdue)} overdue` : "Not yet due"}
        </span>
      </div>
      {accrual ? (
        <div className="mt-1 text-prose text-fg-muted">
          <p className="tnum">+ {formatINR(accrual.amount)} interest accrued</p>
          <p>
            {basisLabel(accrual.basis)} · {formatAccrualPeriod(accrual)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** One offer card's frame. */
function OfferCard({
  title,
  tone = "default",
  children,
}: {
  title: string;
  tone?: "default" | "hero" | "muted";
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-card border p-4",
        tone === "hero" && "border-accent-edge bg-accent-tint",
        tone === "muted" && "border-hairline bg-subtle",
        tone === "default" && "border-hairline bg-card",
      )}
    >
      <h3 className="text-body font-semibold text-fg">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

/** Creates an offer and refreshes the open-offer chips. */
function useCreateOffer(invoiceId: string, successCopy: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOfferBody) => createOffer(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: commercialTermsQueryKeys.offers(invoiceId),
      });
      toast(successCopy);
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't create the offer.")),
  });
}

/** The hero action: trade the accrued interest for the principal by a date. */
function WaiverCard({
  invoice,
  accrual,
  asOf,
}: {
  invoice: OfferSheetInvoice;
  accrual: InterestAccrual | null;
  asOf: string;
}) {
  const selectId = useId();
  const [expiresOn, setExpiresOn] = useState(addDays(asOf, WAIVER_DEADLINES[0]));
  const mutation = useCreateOffer(invoice.invoice_id, "Waiver offer sent for approval");

  if (accrual === null) {
    return (
      <OfferCard title="Waive accrued interest" tone="muted">
        <p className="text-prose text-fg-soft">
          No interest has accrued. Late payment interest is off for {invoice.account_name}, or the
          invoice isn&apos;t past its due date and grace period.
        </p>
        <Link
          to="/app/settings"
          search={{ section: "commercial-terms" }}
          className="inline-block text-prose font-semibold text-accent hover:text-accent-hover"
        >
          Commercial terms settings
        </Link>
      </OfferCard>
    );
  }

  return (
    <OfferCard title="Waive accrued interest" tone="hero">
      <p className="text-prose text-fg">
        <span className="tnum">{formatINR(accrual.amount)}</span> accrued under{" "}
        {basisLabel(accrual.basis)}. Waive it in full if the{" "}
        <span className="tnum">{formatINR(invoice.outstanding)}</span> principal clears by:
      </p>
      <div>
        <label
          htmlFor={selectId}
          className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
        >
          Principal must clear by
        </label>
        <select
          id={selectId}
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
          className="field mt-1.5"
        >
          {WAIVER_DEADLINES.map((days) => {
            const date = addDays(asOf, days);
            return (
              <option key={date} value={date}>
                {formatShortDate(date)}
              </option>
            );
          })}
        </select>
      </div>
      <AppButton
        className="w-full"
        loading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            kind: "interest_waiver",
            invoice_id: invoice.invoice_id,
            amount: accrual.amount,
            expires_on: expiresOn,
          })
        }
      >
        Create waiver offer
      </AppButton>
    </OfferCard>
  );
}

/**
 * An early payment discount, but only where one is honest: the account is on a
 * pre-agreed, active discount policy and the invoice is still inside its
 * window. Anywhere else this card says so and points at a settlement instead —
 * a discount nobody agreed is a write-off, and is labelled as one.
 */
function DiscountCard({
  invoice,
  resolved,
  asOf,
  onOfferSettlement,
}: {
  invoice: OfferSheetInvoice;
  resolved: ResolvedAccountTerms | undefined;
  asOf: string;
  onOfferSettlement: () => void;
}) {
  const mutation = useCreateOffer(invoice.invoice_id, "Discount offer sent for approval");
  const policy = resolved?.discountPolicy ?? null;
  const windowEnds = policy ? addDays(invoice.issue_date, policy.window_days) : null;
  const reason = discountIneligibility(invoice, policy, windowEnds, asOf);

  if (reason !== null || policy === null || windowEnds === null) {
    return (
      <OfferCard title="Early payment discount" tone="muted">
        <p className="text-prose text-fg-soft">{reason}</p>
        <button
          type="button"
          onClick={onOfferSettlement}
          className="cursor-pointer text-prose font-semibold text-fg-soft hover:text-fg"
        >
          Offer a settlement →
        </button>
      </OfferCard>
    );
  }

  const amount = fromPaise(
    BigInt(Math.round(Number(toPaise(invoice.outstanding)) * (policy.discount_pct / 100))),
  );
  return (
    <OfferCard title="Early payment discount">
      <p className="text-prose text-fg-soft">
        {formatPercent(policy.discount_pct)} off — <span className="tnum">{formatINR(amount)}</span>{" "}
        — if paid by {formatShortDate(windowEnds)}. Leaves as a credit note when it&apos;s taken.
      </p>
      <AppButton
        variant="secondary"
        className="w-full"
        loading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            kind: "early_discount",
            invoice_id: invoice.invoice_id,
            amount,
            expires_on: windowEnds,
          })
        }
      >
        Create discount offer
      </AppButton>
    </OfferCard>
  );
}

/** Why no discount can be offered on this invoice, or null when one can. */
function discountIneligibility(
  invoice: OfferSheetInvoice,
  policy: ResolvedAccountTerms["discountPolicy"],
  windowEnds: string | null,
  asOf: string,
): string | null {
  if (policy === null || !policy.active) {
    return `Not available. ${invoice.account_name} has no early payment discount terms.`;
  }
  if (!policy.pre_agreed) {
    return "Not available. These discount terms weren't agreed before the invoice was issued, so any reduction is a settlement, not a discount.";
  }
  const overdue = daysBetween(invoice.due_date, asOf);
  if (overdue > 0) {
    return `Not available. This invoice is ${formatOverdueDays(overdue)} past its due date.`;
  }
  if (windowEnds !== null && asOf > windowEnds) {
    return `Not available. The discount window closed on ${formatShortDate(windowEnds)}.`;
  }
  return null;
}

/** Accept less to close the invoice. Over the threshold, the owner has to type the name. */
function SettlementCard({
  invoice,
  inputRef,
  asOf,
}: {
  invoice: OfferSheetInvoice;
  inputRef: React.RefObject<HTMLInputElement | null>;
  asOf: string;
}) {
  const inputId = useId();
  const errorId = useId();
  const defaultAmount = fromPaise(((toPaise(invoice.outstanding) * 85n) / 100n / 100n) * 100n);
  const [amount, setAmount] = useState(defaultAmount);
  const [confirming, setConfirming] = useState(false);
  const mutation = useCreateOffer(invoice.invoice_id, "Settlement offer sent for approval");
  const check = settlementCheck(invoice.outstanding, amount);
  const expiresOn = addDays(asOf, 7);

  /** Sends the offer for approval. */
  function submit() {
    mutation.mutate(
      {
        kind: "settlement",
        invoice_id: invoice.invoice_id,
        amount: amount.trim(),
        expires_on: expiresOn,
      },
      { onSuccess: () => setConfirming(false) },
    );
  }

  return (
    <OfferCard title="Settlement offer">
      <p className="text-prose text-fg-soft">
        Accept a reduced amount to close this invoice. The difference leaves as a credit note.
      </p>
      <div>
        <label
          htmlFor={inputId}
          className="block text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
        >
          Amount
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={!check.valid || undefined}
          aria-describedby={errorId}
          className="field tnum mt-1.5"
        />
        <p id={errorId} className="mt-1.5 text-prose">
          {check.valid ? (
            <span className="tnum text-fg-muted">
              {formatPercent(100 - check.haircutPct)} of principal · {formatINR(check.haircut)}{" "}
              haircut
            </span>
          ) : (
            <span className="text-danger">{check.error}</span>
          )}
        </p>
      </div>
      {check.valid && check.needsOwnerApproval ? (
        <p className="flex items-center gap-2 rounded-nav bg-warn-tint px-3 py-2 text-prose font-semibold text-warn">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          Above 10% — needs approval from the account owner
        </p>
      ) : null}
      <AppButton
        variant="secondary"
        className="w-full"
        disabled={!check.valid}
        loading={mutation.isPending && !confirming}
        onClick={() => (check.valid && check.needsOwnerApproval ? setConfirming(true) : submit())}
      >
        Create settlement offer
      </AppButton>
      <TypeToConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Offer ${invoice.account_name} a settlement of ${formatINR(amount)}?`}
        phrase={invoice.account_name}
        confirmLabel="Send for approval"
        busy={mutation.isPending}
        onConfirm={submit}
      >
        <p>
          If accepted, {invoice.invoice_number} closes and a credit note for{" "}
          {check.valid ? formatINR(check.haircut) : "the difference"} plus GST is drafted in Tax
          documents. The invoice value of {formatINR(invoice.outstanding)} does not change.
        </p>
        <p>The haircut is above 10%, so the account owner must approve before the offer is sent.</p>
      </TypeToConfirmDialog>
    </OfferCard>
  );
}

/** Split into monthly instalments; chasing pauses while the plan is honoured. */
function PlanCard({ invoice, asOf }: { invoice: OfferSheetInvoice; asOf: string }) {
  const [count, setCount] = useState(4);
  const mutation = useCreateOffer(invoice.invoice_id, "Payment plan sent for approval");
  const firstDueOn = addDays(asOf, 14);
  const schedule = splitInstalments(invoice.outstanding, count, firstDueOn);

  return (
    <OfferCard title="Payment plan">
      <p className="text-prose text-fg-soft">
        Split <span className="tnum">{formatINR(invoice.outstanding)}</span> across instalments.
        Chasing pauses while the plan is being honoured.
      </p>
      <div className="flex items-center gap-3">
        <span className="text-prose text-fg-soft">Instalments</span>
        <button
          type="button"
          aria-label="One fewer instalment"
          disabled={count <= MIN_INSTALMENTS}
          onClick={() => setCount((n) => Math.max(MIN_INSTALMENTS, n - 1))}
          className="grid size-8 cursor-pointer place-content-center rounded-nav border border-stroke bg-card text-fg hover:bg-hovered disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Minus className="size-3.5" aria-hidden="true" />
        </button>
        <output aria-live="polite" className="tnum w-6 text-center text-body font-semibold">
          {count}
        </output>
        <button
          type="button"
          aria-label="One more instalment"
          disabled={count >= MAX_INSTALMENTS}
          onClick={() => setCount((n) => Math.min(MAX_INSTALMENTS, n + 1))}
          className="grid size-8 cursor-pointer place-content-center rounded-nav border border-stroke bg-card text-fg hover:bg-hovered disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <ol className="tnum space-y-2 rounded-nav bg-subtle px-3 py-3 text-prose">
        {schedule.map((row) => (
          <li key={row.due_on} className="flex justify-between">
            <span className="text-fg-soft">{formatShortDate(row.due_on)}</span>
            <span className="font-semibold text-fg">{formatINR(row.amount)}</span>
          </li>
        ))}
      </ol>
      <AppButton
        variant="secondary"
        className="w-full"
        loading={mutation.isPending}
        onClick={() =>
          mutation.mutate({
            kind: "payment_plan",
            invoice_id: invoice.invoice_id,
            amount: invoice.outstanding,
            instalments: schedule,
          })
        }
      >
        Create payment plan
      </AppButton>
    </OfferCard>
  );
}
