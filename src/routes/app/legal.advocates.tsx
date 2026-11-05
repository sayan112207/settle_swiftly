import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { AppSkeleton } from "@/components/app/AppSkeleton";
import { QueryNotice } from "@/components/app/QueryNotice";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/format";
import type { Advocate } from "@/lib/schemas/legal";
import { getAdvocates, getEligible, legalQueryKeys } from "@/lib/services/legal";
import { MATTER_FEE, parseInvoiceIds, selectionSummary } from "@/lib/services/legal-rules";

const searchSchema = z.object({ invoices: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/app/legal/advocates")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Advocates — ${PRODUCT_NAME}` }] }),
  component: AdvocatesPage,
});

/**
 * Advocates in the network who handle commercial recovery.
 *
 * Facts only — enrolment, practice, courts, stated fee, languages, typical
 * response time. No ratings, rankings or success rates: advocates may not be
 * advertised that way, and the platform does not share in their fees.
 */
function AdvocatesPage() {
  const { invoices } = Route.useSearch();
  const ids = parseInvoiceIds(invoices);
  const advocatesQuery = useQuery({
    queryKey: legalQueryKeys.advocates,
    queryFn: () => getAdvocates(),
    retry: false,
  });
  const eligibleQuery = useQuery({
    queryKey: legalQueryKeys.eligible,
    queryFn: () => getEligible(),
    retry: false,
  });
  const selection = eligibleQuery.data
    ? selectionSummary(eligibleQuery.data.items, new Set(ids))
    : null;

  return (
    <div className="space-y-6">
      <Link
        to="/app/legal/recover"
        search={{ invoices: invoices ?? "" }}
        className="inline-block text-prose font-semibold text-fg-soft hover:text-fg"
      >
        ← Recovery options
      </Link>
      <header>
        <h1 className="text-title font-bold tracking-tight text-fg">
          Advocates who handle commercial recovery
        </h1>
        <p className="mt-1 text-prose text-fg-soft">
          {selection && selection.count > 0 ? (
            <>
              <span className="tnum">{formatINR(selection.total)}</span> across{" "}
              {selection.count === 1 ? "1 invoice" : `${selection.count} invoices`}
              {advocatesQuery.data ? ` · ${advocatesQuery.data.jurisdiction}` : ""}
            </>
          ) : (
            (advocatesQuery.data?.jurisdiction ?? "")
          )}
        </p>
      </header>

      {eligibleQuery.isError ? (
        <QueryNotice
          error={eligibleQuery.error}
          fallback="Couldn't load the invoices you selected."
          onRetry={() => void eligibleQuery.refetch()}
        />
      ) : null}

      {advocatesQuery.isPending ? (
        <div className="max-w-4xl space-y-3" aria-busy="true">
          <AppSkeleton className="h-36 w-full" />
          <AppSkeleton className="h-36 w-full" />
        </div>
      ) : advocatesQuery.isError ? (
        <QueryNotice
          error={advocatesQuery.error}
          fallback="Couldn't load advocates."
          onRetry={() => void advocatesQuery.refetch()}
        />
      ) : (
        <div className="max-w-4xl space-y-3">
          {advocatesQuery.data.items.map((advocate) => (
            <AdvocateCard
              key={advocate.advocate_id}
              advocate={advocate}
              invoices={invoices ?? ""}
              canRequest={selection !== null && selection.count > 0}
              checkingInvoices={eligibleQuery.isPending}
            />
          ))}
          <p className="rounded-card bg-alt px-4 py-3 text-prose text-fg">
            You&apos;ll pay the advocate directly. {PRODUCT_NAME} charges{" "}
            <span className="tnum">{formatINR(MATTER_FEE)}</span> per matter for document
            preparation and tracking, billed separately.
          </p>
        </div>
      )}
    </div>
  );
}

/** One advocate: who they are, what they charge, and the way to request them. */
function AdvocateCard({
  advocate,
  invoices,
  canRequest,
  checkingInvoices,
}: {
  advocate: Advocate;
  invoices: string;
  canRequest: boolean;
  checkingInvoices: boolean;
}) {
  const chips = [
    ["Legal notice", formatINR(advocate.notice_fee)],
    [
      "Responds in",
      `~${advocate.responds_in_days} ${advocate.responds_in_days === 1 ? "day" : "days"}`,
    ],
    ["Languages", advocate.languages.join(", ")],
    ...advocate.facts.map((fact) => ["", fact] as const),
  ] as const;

  return (
    <article className="rounded-card border border-hairline bg-card px-6 py-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-section font-bold tracking-tight text-fg">{advocate.name}</h2>
        <span className="text-prose text-fg-soft">· {advocate.enrolment_number}</span>
      </div>
      <p className="mt-1 text-body font-normal text-fg">{advocate.practice}</p>
      <p className="mt-0.5 text-prose text-fg-soft">{advocate.location}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {chips.map(([label, value]) => (
          <li
            key={`${label}${value}`}
            className="rounded-pill border border-hairline bg-subtle px-3 py-1 text-prose text-fg-soft"
          >
            {label ? `${label} ` : ""}
            <strong className="tnum font-semibold text-fg">{value}</strong>
          </li>
        ))}
      </ul>
      <p className="mt-3 max-w-3xl text-body font-normal text-fg-soft">
        &ldquo;{advocate.note}&rdquo;
      </p>
      {checkingInvoices ? (
        <p className="mt-4 text-prose text-fg-muted">Checking the invoices you selected…</p>
      ) : canRequest ? (
        <Link
          to="/app/legal/review"
          search={{ invoices, advocate: advocate.advocate_id }}
          className="mt-4 inline-flex items-center rounded-pill border border-stroke bg-card px-4 py-2 text-body font-semibold text-fg hover:bg-hovered"
        >
          Request this advocate
        </Link>
      ) : (
        <p className="mt-4 text-prose text-fg-soft">
          Choose at least one eligible invoice before requesting an advocate.
        </p>
      )}
    </article>
  );
}
