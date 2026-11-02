import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { TonePill, type PillTone } from "@/components/app/TonePill";
import { formatINR, formatShortDate } from "@/lib/format";
import type { PayerGrade } from "@/lib/schemas/commercial-terms";
import { commercialTermsQueryKeys, getCommercialTerms } from "@/lib/services/commercial-terms";
import {
  formatRatePct,
  indexAccountTerms,
  policyRatePct,
  type ResolvedAccountTerms,
} from "@/lib/services/commercial-terms-rules";

/**
 * Commercial terms on the account page: a credit-hold banner above the
 * header, and a terms card beside the aging bar.
 *
 * Both read the same cached terms query. Until the terms endpoint exists both
 * render nothing — the account page is already complete without them, and a
 * "coming soon" card on every account would be noise.
 */

/** Grade badge tones: A is good, D is the one to stop supplying. */
const GRADE_TONE: Record<PayerGrade, PillTone> = {
  A: "green",
  B: "neutral",
  C: "warn",
  D: "danger",
};

type LoadedAccountTerms = ResolvedAccountTerms & { bankRatePct: number };

/** This account's resolved terms, or undefined while loading, missing or unavailable. */
function useAccountTerms(accountId: string): LoadedAccountTerms | undefined {
  const query = useQuery({
    queryKey: commercialTermsQueryKeys.terms,
    queryFn: () => getCommercialTerms(),
    retry: false,
  });
  if (!query.data) return undefined;
  const resolved = indexAccountTerms(query.data).get(accountId);
  return resolved ? { ...resolved, bankRatePct: query.data.rates.bank_rate_pct } : undefined;
}

/**
 * Shown above the account header when the account is on credit hold: what is
 * owed against the limit, and who set the hold.
 */
export function CreditHoldBanner({ accountId }: { accountId: string }) {
  const resolved = useAccountTerms(accountId);
  const hold = resolved?.terms.credit_hold;
  if (!resolved || !hold) return null;

  const { terms } = resolved;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-edge bg-danger-tint px-4 py-3"
    >
      <p className="text-body font-normal text-danger">
        <strong className="font-semibold">Credit hold.</strong>{" "}
        <span className="tnum">
          {formatINR(terms.outstanding)} outstanding
          {terms.credit_limit ? ` against a ${formatINR(terms.credit_limit)} limit` : ""}.
        </span>{" "}
        Set by {hold.set_by} on {formatShortDate(hold.set_on)}.
        {hold.reason ? ` ${hold.reason}` : ""}
      </p>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="cursor-not-allowed text-body font-semibold text-danger opacity-50"
      >
        Release hold
      </button>
    </div>
  );
}

/**
 * The account's commercial terms. Payment terms come from the account's own
 * settings, which are the source of truth for them; the rest from the terms
 * endpoint.
 */
export function AccountTermsCard({ accountId, termDays }: { accountId: string; termDays: number }) {
  const resolved = useAccountTerms(accountId);
  if (!resolved) return null;

  const { terms, feePolicy, discountPolicy, bankRatePct } = resolved;
  const interest =
    terms.interest_enabled && feePolicy
      ? `${feePolicy.name} · ${formatRatePct(policyRatePct(feePolicy, bankRatePct))}`
      : "Off";

  return (
    <section
      aria-labelledby="account-terms"
      className="rounded-card border border-hairline bg-card px-5 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="account-terms"
          className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
        >
          Commercial terms
        </h2>
        <Link
          to="/app/settings"
          search={{ section: "commercial-terms" }}
          className="text-prose font-semibold text-accent hover:text-accent-hover"
        >
          Edit policies
        </Link>
      </div>
      <dl className="tnum mt-3 grid gap-x-6 gap-y-2 text-body sm:grid-cols-2 lg:grid-cols-5">
        <TermRow label="Payment terms" value={`${termDays} days`} />
        <TermRow label="Interest" value={interest} />
        <TermRow
          label="Discount"
          value={
            discountPolicy && discountPolicy.active
              ? `${discountPolicy.discount_pct}% within ${discountPolicy.window_days} days`
              : "None"
          }
        />
        <TermRow
          label="Credit limit"
          value={terms.credit_limit ? formatINR(terms.credit_limit) : "None"}
        />
        <div>
          <dt className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
            Payer grade
          </dt>
          <dd className="mt-1 flex items-center gap-2">
            {terms.payer_grade ? (
              <>
                <TonePill tone={GRADE_TONE[terms.payer_grade]}>{terms.payer_grade}</TonePill>
                {terms.payer_grade_note ? (
                  <span className="text-prose text-fg-soft">{terms.payer_grade_note}</span>
                ) : null}
              </>
            ) : (
              <span className="font-semibold text-fg">Not graded yet</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** One label/value pair in the terms card. */
function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-fg">{value}</dd>
    </div>
  );
}
