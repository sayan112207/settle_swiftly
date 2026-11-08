import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { z } from "zod";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { QueryNotice } from "@/components/app/QueryNotice";
import { TonePill } from "@/components/app/TonePill";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR } from "@/lib/format";
import type { EligibleResponse } from "@/lib/schemas/legal";
import { getEligible, legalQueryKeys } from "@/lib/services/legal";
import {
  joinNames,
  parseInvoiceIds,
  qualifyLabel,
  selectionSummary,
  statutoryRoutesOpen,
} from "@/lib/services/legal-rules";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ invoices: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/app/legal/recover")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Recovery options — ${PRODUCT_NAME}` }] }),
  component: RecoverPage,
});

/** Hover copy for actions whose backend isn't built yet. */
const COMING_SOON = "Coming soon";

/** The recovery ladder for the chosen invoices, least escalated first. */
function RecoverPage() {
  const { invoices } = Route.useSearch();
  const eligibleQuery = useQuery({
    queryKey: legalQueryKeys.eligible,
    queryFn: () => getEligible(),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <Link
        to="/app/legal"
        className="inline-block text-prose font-semibold text-fg-soft hover:text-fg"
      >
        ← Eligible invoices
      </Link>
      {eligibleQuery.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <AppSkeleton className="h-10 w-2/3" />
          <AppSkeleton className="h-40 w-full" />
          <AppSkeleton className="h-40 w-full" />
        </div>
      ) : eligibleQuery.isError ? (
        <QueryNotice
          error={eligibleQuery.error}
          fallback="Couldn't load recovery options."
          onRetry={() => void eligibleQuery.refetch()}
        />
      ) : (
        <Ladder data={eligibleQuery.data} invoiceIds={parseInvoiceIds(invoices)} />
      )}
    </div>
  );
}

/** The four routes, once the invoices are known. */
function Ladder({ data, invoiceIds }: { data: EligibleResponse; invoiceIds: string[] }) {
  const selection = selectionSummary(data.items, new Set(invoiceIds));
  if (selection.count === 0) {
    return (
      <div className="rounded-card border border-hairline bg-card px-5 py-12 text-center">
        <p className="text-section font-bold tracking-tight text-fg">No invoices chosen.</p>
        <p className="mt-1 text-prose text-fg-soft">
          Pick one or more eligible invoices to see what can be done about them.
        </p>
      </div>
    );
  }

  const names = joinNames(selection.rows.map((row) => row.account_name));
  const statutory = statutoryRoutesOpen(data.seller);
  const invoicesParam = selection.rows.map((row) => row.invoice_id).join(",");
  const size = data.seller.enterprise_size === "micro" ? "Micro" : "Small";

  return (
    <>
      <header>
        <h1 className="max-w-4xl text-title font-bold tracking-tight text-fg">
          Recovering <span className="tnum">{formatINR(selection.total)}</span> from {names}
        </h1>
        <p className="mt-1 text-prose text-fg-soft">
          {selection.rows.map((row) => row.invoice_number).join(", ")} · Routes are listed from
          least to most escalated.
        </p>
      </header>

      <div className="max-w-4xl space-y-3">
        <RouteCard
          title="Section 43B(h) notice"
          price={<TonePill tone="green">Free</TonePill>}
          dimmed={!statutory}
          summary="Your client loses the income-tax deduction for this expense until they pay, if they haven't paid a registered micro or small enterprise within 45 days. A factual notice stating this is often enough."
          facts={[
            ["Cost", "Free"],
            ["Typical time", "1–2 weeks"],
            ["What it needs", "Udyam registration"],
            ["Ends relationship", "Usually survives"],
          ]}
        >
          {statutory ? (
            <p className="rounded-nav border border-accent-edge bg-accent-tint px-3 py-2 text-prose font-semibold text-accent">
              You&apos;re registered as a {size} Enterprise — {qualifyLabel(selection.count)}.
            </p>
          ) : (
            <StatutoryClosedNote seller={data.seller} />
          )}
          <AppButton disabled title={COMING_SOON}>
            Draft notice
          </AppButton>
        </RouteCard>

        <RouteCard
          title="MSE Facilitation Council"
          price={<TonePill tone="green">Free to file</TonePill>}
          dimmed={!statutory}
          summary="File a reference with your state's Micro and Small Enterprise Facilitation Council. The council attempts conciliation first, and arbitrates if that fails."
          facts={[
            ["Cost", "Free to file"],
            ["Typical time", "3–6 months"],
            ["What it needs", "Udyam registration"],
            ["Ends relationship", "Usually ends"],
          ]}
        >
          {statutory ? null : <StatutoryClosedNote seller={data.seller} />}
          <AppButton variant="secondary" disabled title={COMING_SOON}>
            Prepare filing
          </AppButton>
        </RouteCard>

        <RouteCard
          title="Advocate's legal notice"
          price={<TonePill tone="neutral">Paid to the advocate</TonePill>}
          summary="A formal notice from a practising advocate, on their letterhead, demanding payment within a stated period. The most common first legal step."
          facts={[
            ["Cost", "Set by the advocate"],
            ["Typical time", "2–4 weeks"],
            ["What it needs", "Invoice and proof of delivery"],
            ["Ends relationship", "Usually ends"],
          ]}
        >
          <Link
            to="/app/legal/advocates"
            search={{ invoices: invoicesParam }}
            className="inline-flex items-center rounded-pill bg-accent px-4 py-2 text-body font-semibold text-white hover:bg-accent-hover"
          >
            Find an advocate
          </Link>
        </RouteCard>

        <RouteCard
          title="Summary suit, Order XXXVII CPC"
          price={<TonePill tone="neutral">Court fees apply</TonePill>}
          summary="A faster civil procedure for recovering a debt on a written contract or invoice. The defendant must seek the court's leave to defend."
          facts={[
            ["Cost", "Court fees plus advocate's fees"],
            ["Typical time", "6–18 months"],
            ["What it needs", "Written contract or acknowledged invoice"],
            ["Ends relationship", "Ends"],
          ]}
        >
          <Link
            to="/app/legal/advocates"
            search={{ invoices: invoicesParam }}
            className="inline-flex items-center rounded-pill border border-stroke bg-card px-4 py-2 text-body font-semibold text-fg hover:bg-hovered"
          >
            Discuss with an advocate
          </Link>
        </RouteCard>

        <p className="max-w-3xl pt-2 text-prose text-fg-soft">
          {PRODUCT_NAME} is not a law firm and does not provide legal advice. Advocates listed here
          are independent practitioners who bill you directly. We prepare documents and track the
          matter.
        </p>
      </div>
    </>
  );
}

/** Shown on a statutory route the org can't use, with the way to open it. */
function StatutoryClosedNote({ seller }: { seller: EligibleResponse["seller"] }) {
  if (seller.is_trader) {
    return (
      <p className="text-prose text-fg-soft">
        These routes are for micro and small manufacturers and service providers. A trader&apos;s
        Udyam registration covers priority-sector lending.
      </p>
    );
  }
  if (seller.udyam_registered) {
    return (
      <p className="text-prose text-fg-soft">
        These routes are open to micro and small enterprises only. Your registered size does not
        qualify.
      </p>
    );
  }
  return (
    <p className="text-prose text-fg-soft">
      Open to micro and small manufacturers and service providers registered on Udyam. Register at{" "}
      <a
        href="https://udyamregistration.gov.in"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-accent hover:text-accent-hover"
      >
        udyamregistration.gov.in ↗
      </a>
    </p>
  );
}

/** One route on the ladder. */
function RouteCard({
  title,
  price,
  summary,
  facts,
  dimmed = false,
  children,
}: {
  title: string;
  price: ReactNode;
  summary: string;
  facts: [string, string][];
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-card border border-hairline bg-card px-6 py-5",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-section font-bold tracking-tight text-fg">{title}</h2>
        {price}
      </div>
      <p className="mt-1.5 max-w-3xl text-body font-normal text-fg-soft">{summary}</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-hairline pt-4 md:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
              {label}
            </dt>
            <dd className="mt-1 text-body font-normal text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-4">{children}</div>
    </section>
  );
}
