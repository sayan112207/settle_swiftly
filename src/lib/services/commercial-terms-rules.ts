import type {
  AccountTerms,
  CommercialTerms,
  DiscountPolicy,
  FeePolicy,
  InstalmentDraft,
  InterestBasis,
  PaymentPlan,
} from "@/lib/schemas/commercial-terms";

/**
 * Pure rules behind commercial terms. No React, no fetch — everything here is
 * unit-tested in `commercial-terms-rules.test.ts`.
 *
 * Money crosses this module as decimal strings. Sums and differences go
 * through integer paise. Interest and discount maths multiply by a rate, which
 * is inherently fractional, so those compute in floating point and round to
 * paise exactly once, at the end.
 */

const MS_PER_DAY = 86_400_000;

/** Money string → integer paise, without a float touching the paise. */
export function toPaise(value: string): bigint {
  const negative = value.trim().startsWith("-");
  const [whole = "0", fraction = ""] = value.trim().replace(/^-/, "").split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -paise : paise;
}

/** Integer paise → money string with two decimals. */
export function fromPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** A float rupee amount rounded half-up to paise, as a money string. */
function roundToMoney(rupees: number): string {
  const paise = Math.round(rupees * 100);
  return fromPaise(BigInt(paise));
}

/** `YYYY-MM-DD` → midnight UTC. Read as parts, so no time zone can shift the day. */
function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

/** Midnight-UTC `Date` → `YYYY-MM-DD`. */
function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

/** `iso` plus `days` calendar days. */
export function addDays(iso: string, days: number): string {
  return formatIsoDate(new Date(parseIsoDate(iso).getTime() + days * MS_PER_DAY));
}

/**
 * `iso` plus `months` calendar months, keeping `anchorDay` where the month has
 * one and clamping to the month's last day where it doesn't. 31 Jan + 1 month
 * is 28 Feb, and + 2 months is 31 Mar again — not 28 Mar, which is what
 * chaining single-month steps would drift to.
 */
export function addMonthsClamped(iso: string, months: number, anchorDay?: number): string {
  const start = parseIsoDate(iso);
  const day = anchorDay ?? start.getUTCDate();
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatIsoDate(target);
}

/**
 * The calendar date of an ISO timestamp in India.
 *
 * Pinned to Asia/Kolkata for the same reason `format.ts` pins its formatters:
 * the server and browser must agree on which day "as of" is.
 */
export function istDateOf(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoTimestamp));
}

/** Section 16 of the MSMED Act: three times the RBI bank rate. */
export function statutoryRatePct(bankRatePct: number): number {
  return Math.round(bankRatePct * 3 * 100) / 100;
}

/** The annual rate a policy charges, given the current bank rate. */
export function policyRatePct(policy: FeePolicy, bankRatePct: number): number {
  return policy.basis === "msmed_s16"
    ? statutoryRatePct(bankRatePct)
    : (policy.rate_annual_pct ?? 0);
}

/** "16.50%" — rates keep two decimals, as the RBI publishes them. */
export function formatRatePct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

/** "10.5%" — derived percentages keep one decimal, per the formatting rules. */
export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export type InterestAccrual = {
  /** Money string. Shown beside the principal, never added into it. */
  amount: string;
  basis: InterestBasis;
  ratePct: number;
  compounding: "none" | "monthly";
  /** Days past the due date, before any grace is taken off. */
  daysOverdue: number;
  /** Days interest was actually charged for. */
  chargedDays: number;
  /** Complete monthly rests, for compounded interest; 0 for simple. */
  months: number;
  /** Days after the last monthly rest. */
  stubDays: number;
};

/**
 * Interest accrued on an overdue amount as of a date, or null when nothing has
 * accrued yet.
 *
 * Section 16 compounds with monthly rests from the due date and ignores any
 * grace period: the statute sets the terms, the org's policy can't soften them.
 * Contractual interest is charged on the days beyond the policy's grace, simple
 * or compounded as the policy says.
 *
 * Compounding: whole months grow the principal by (1 + r/12); the stub after
 * the last rest is charged pro rata on the grown balance, on a 30-day month.
 */
export function accruedInterest(input: {
  principal: string;
  dueDate: string;
  asOf: string;
  policy: FeePolicy;
  bankRatePct: number;
}): InterestAccrual | null {
  const { principal, dueDate, asOf, policy, bankRatePct } = input;
  const daysOverdue = daysBetween(dueDate, asOf);
  const statutory = policy.basis === "msmed_s16";
  const grace = statutory ? 0 : policy.grace_days;
  const principalRupees = Number(principal);
  if (daysOverdue <= grace || !(principalRupees > 0)) return null;

  const ratePct = policyRatePct(policy, bankRatePct);
  const compounding = statutory ? "monthly" : policy.compounding;
  const startsOn = addDays(dueDate, grace);
  const chargedDays = daysOverdue - grace;

  if (compounding === "none") {
    const amount = (principalRupees * (ratePct / 100) * chargedDays) / 365;
    return {
      amount: roundToMoney(amount),
      basis: policy.basis,
      ratePct,
      compounding,
      daysOverdue,
      chargedDays,
      months: 0,
      stubDays: chargedDays,
    };
  }

  const anchorDay = parseIsoDate(startsOn).getUTCDate();
  let months = 0;
  while (addMonthsClamped(startsOn, months + 1, anchorDay) <= asOf) months += 1;
  const lastRest = addMonthsClamped(startsOn, months, anchorDay);
  const stubDays = daysBetween(lastRest, asOf);
  const monthlyRate = ratePct / 100 / 12;
  const grown = principalRupees * Math.pow(1 + monthlyRate, months);
  const amount = grown - principalRupees + grown * monthlyRate * (stubDays / 30);

  return {
    amount: roundToMoney(amount),
    basis: policy.basis,
    ratePct,
    compounding,
    daysOverdue,
    chargedDays,
    months,
    stubDays,
  };
}

/** "5 months + 4 days" / "151 days" — the period an accrual covers. */
export function formatAccrualPeriod(accrual: InterestAccrual): string {
  if (accrual.compounding === "none") {
    return `${accrual.chargedDays} ${accrual.chargedDays === 1 ? "day" : "days"}`;
  }
  const monthWord = accrual.months === 1 ? "month" : "months";
  const dayWord = accrual.stubDays === 1 ? "day" : "days";
  if (accrual.months === 0) return `${accrual.stubDays} ${dayWord}`;
  if (accrual.stubDays === 0) return `${accrual.months} ${monthWord}`;
  return `${accrual.months} ${monthWord} + ${accrual.stubDays} ${dayWord}`;
}

/** "Section 16, MSMED Act" / "Contractual terms". */
export function basisLabel(basis: InterestBasis): string {
  return basis === "msmed_s16" ? "Section 16, MSMED Act" : "Contractual terms";
}

/** The working shown under a policy's rate: "3 × 5.50% bank rate", or null. */
export function rateWorking(policy: FeePolicy, bankRatePct: number): string | null {
  return policy.basis === "msmed_s16" ? `3 × ${formatRatePct(bankRatePct)} bank rate` : null;
}

/** "16.50% p.a. compounded monthly" / "18.00% p.a. simple". */
export function rateDescription(policy: FeePolicy, bankRatePct: number): string {
  const rate = formatRatePct(policyRatePct(policy, bankRatePct));
  const monthly = policy.basis === "msmed_s16" || policy.compounding === "monthly";
  return `${rate} p.a. ${monthly ? "compounded monthly" : "simple"}`;
}

/**
 * The annual cost of an early payment discount, as a percentage, or null when
 * the terms give no days of early payment to price.
 *
 *   cost = d / (100 − d) × 365 / (net − window)
 *
 * 1% within 10 days on 45-day terms is 10.5% a year; 2% is 21.3%.
 */
export function impliedDiscountCostPct(
  discountPct: number,
  windowDays: number,
  netDays: number,
): number | null {
  const daysSooner = netDays - windowDays;
  if (daysSooner <= 0 || discountPct <= 0 || discountPct >= 100) return null;
  return (discountPct / (100 - discountPct)) * (365 / daysSooner) * 100;
}

export type DiscountVerdict = {
  impliedPct: number;
  costOfCapitalPct: number;
  /** True when the discount costs less than borrowing the same money. */
  cheaper: boolean;
  daysSooner: number;
  /** What the discount gives up on this principal. */
  givenUp: string;
  /** Simple interest at the cost of capital for the same days. */
  overdraftCost: string;
  /** |givenUp − overdraftCost|: how much cheaper or dearer the discount is. */
  difference: string;
};

/**
 * Whether a discount is cheaper than borrowing, and by how much on a given
 * principal. Null when the terms leave no days to be paid sooner.
 */
export function discountVerdict(input: {
  principal: string;
  discountPct: number;
  windowDays: number;
  netDays: number;
  costOfCapitalPct: number;
}): DiscountVerdict | null {
  const { principal, discountPct, windowDays, netDays, costOfCapitalPct } = input;
  const impliedPct = impliedDiscountCostPct(discountPct, windowDays, netDays);
  if (impliedPct === null) return null;
  const daysSooner = netDays - windowDays;
  const amount = Number(principal);
  const givenUp = roundToMoney((amount * discountPct) / 100);
  const overdraftCost = roundToMoney((amount * (costOfCapitalPct / 100) * daysSooner) / 365);
  const diff = toPaise(givenUp) - toPaise(overdraftCost);
  return {
    impliedPct,
    costOfCapitalPct,
    cheaper: impliedPct < costOfCapitalPct,
    daysSooner,
    givenUp,
    overdraftCost,
    difference: fromPaise(diff < 0n ? -diff : diff),
  };
}

/** Settlements above this haircut need the account owner's approval. */
export const OWNER_APPROVAL_HAIRCUT_PCT = 10;

export type SettlementCheck =
  | { valid: false; error: string }
  | { valid: true; haircut: string; haircutPct: number; needsOwnerApproval: boolean };

/**
 * Validates a settlement amount against the principal and works out the
 * haircut. A settlement is for less than the principal and more than nothing;
 * anything else is either a full payment or not an offer.
 */
export function settlementCheck(principal: string, amount: string): SettlementCheck {
  if (!/^\d+(\.\d{1,2})?$/.test(amount.trim())) {
    return { valid: false, error: "Enter an amount, like 408000 or 408000.50." };
  }
  const principalPaise = toPaise(principal);
  const offerPaise = toPaise(amount.trim());
  if (offerPaise <= 0n) return { valid: false, error: "Enter an amount above zero." };
  if (offerPaise >= principalPaise) {
    return { valid: false, error: "Enter an amount below the principal." };
  }
  const haircutPaise = principalPaise - offerPaise;
  const haircutPct = (Number(haircutPaise) / Number(principalPaise)) * 100;
  return {
    valid: true,
    haircut: fromPaise(haircutPaise),
    haircutPct,
    needsOwnerApproval: haircutPct > OWNER_APPROVAL_HAIRCUT_PCT,
  };
}

/**
 * Splits a total into `count` monthly instalments starting on `firstDueOn`.
 * Equal parts in whole paise; the last instalment absorbs the remainder, so
 * the parts always sum to the total exactly.
 */
export function splitInstalments(
  total: string,
  count: number,
  firstDueOn: string,
): InstalmentDraft[] {
  const totalPaise = toPaise(total);
  const parts = BigInt(Math.max(1, Math.floor(count)));
  const base = totalPaise / parts;
  const anchorDay = parseIsoDate(firstDueOn).getUTCDate();
  const out: InstalmentDraft[] = [];
  for (let i = 0n; i < parts; i += 1n) {
    const amount = i === parts - 1n ? totalPaise - base * (parts - 1n) : base;
    out.push({
      due_on: addMonthsClamped(firstDueOn, Number(i), anchorDay),
      amount: fromPaise(amount),
    });
  }
  return out;
}

export type PlanProgress = {
  paid: string;
  remaining: string;
  paidCount: number;
  count: number;
  /** 0–100, one decimal. */
  pct: number;
  /** The first instalment not yet fully paid, or null when none is left. */
  next: PaymentPlan["instalments"][number] | null;
};

/** How far through its schedule a plan is. */
export function planProgress(plan: PaymentPlan): PlanProgress {
  const total = toPaise(plan.total);
  const paid = plan.instalments.reduce((sum, row) => sum + toPaise(row.paid_amount), 0n);
  const paidCount = plan.instalments.filter((row) => row.state === "paid").length;
  const next = plan.instalments.find((row) => row.state !== "paid") ?? null;
  const pct = total > 0n ? Math.round((Number(paid) / Number(total)) * 1000) / 10 : 0;
  return {
    paid: fromPaise(paid),
    remaining: fromPaise(total - paid),
    paidCount,
    count: plan.instalments.length,
    pct,
    next,
  };
}

export type ClaimGate = { backed: true } | { backed: false; reason: string };

/**
 * Whether a message may state an interest figure for an account.
 *
 * An unbacked demand is a liability, not leverage: the thread may later sit in
 * an advocate's matter record. Contractual interest needs the terms to have
 * been on the invoice; Section 16 needs a Udyam registration on file.
 */
export function interestClaimGate(input: {
  basis: InterestBasis;
  termsOnInvoice: boolean;
  udyamRegistered: boolean;
  accountName: string;
}): ClaimGate {
  if (input.basis === "contractual") {
    return input.termsOnInvoice
      ? { backed: true }
      : {
          backed: false,
          reason: `${input.accountName} has no interest terms on its invoices. Add terms to the account, or remove the interest claim.`,
        };
  }
  return input.udyamRegistered
    ? { backed: true }
    : {
        backed: false,
        reason:
          "Section 16 applies only to registered micro and small enterprises. Add your Udyam registration, or remove the interest claim.",
      };
}

/** Days since the bank rate was last confirmed. */
export function bankRateAgeDays(bankRateAsOf: string, asOf: string): number {
  return daysBetween(bankRateAsOf, asOf);
}

/** A bank rate older than this many days gets the stale warning. */
export const BANK_RATE_STALE_AFTER_DAYS = 60;

export type ResolvedAccountTerms = {
  terms: AccountTerms;
  feePolicy: FeePolicy | null;
  discountPolicy: DiscountPolicy | null;
};

/** Account terms by account id, with their policies resolved. */
export function indexAccountTerms(data: CommercialTerms): Map<string, ResolvedAccountTerms> {
  const fees = new Map(data.fee_policies.map((p) => [p.policy_id, p]));
  const discounts = new Map(data.discount_policies.map((p) => [p.policy_id, p]));
  return new Map(
    data.account_terms.map((terms) => [
      terms.account_id,
      {
        terms,
        feePolicy: terms.fee_policy_id ? (fees.get(terms.fee_policy_id) ?? null) : null,
        discountPolicy: terms.discount_policy_id
          ? (discounts.get(terms.discount_policy_id) ?? null)
          : null,
      },
    ]),
  );
}

/**
 * Interest on one invoice, or null when the account has interest switched off,
 * has no policy, or nothing has accrued yet. Off is the default.
 */
export function invoiceInterest(input: {
  resolved: ResolvedAccountTerms | undefined;
  principal: string;
  dueDate: string;
  asOf: string;
  bankRatePct: number;
}): InterestAccrual | null {
  const { resolved } = input;
  if (!resolved?.terms.interest_enabled || !resolved.feePolicy) return null;
  return accruedInterest({
    principal: input.principal,
    dueDate: input.dueDate,
    asOf: input.asOf,
    policy: resolved.feePolicy,
    bankRatePct: input.bankRatePct,
  });
}
