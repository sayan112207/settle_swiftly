import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { QueryNotice } from "@/components/app/QueryNotice";
import { TypeToConfirmDialog } from "@/components/app/TypeToConfirmDialog";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatShortDate } from "@/lib/format";
import type { Advocate, EligibleInvoice, EligibleResponse } from "@/lib/schemas/legal";
import { featureErrorMessage } from "@/lib/services/feature-api";
import { createMatters, getAdvocates, getEligible, legalQueryKeys } from "@/lib/services/legal";
import {
  defaultDemandText,
  fromPaise,
  istDateOf,
  MATTER_FEE,
  parseInvoiceIds,
  selectionSummary,
  statutoryRoutesOpen,
  toPaise,
  totalMatterCost,
} from "@/lib/services/legal-rules";

const searchSchema = z.object({
  invoices: z.string().optional().catch(undefined),
  advocate: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/app/legal/review")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Review before sending — ${PRODUCT_NAME}` }] }),
  component: ReviewPage,
});

/** The draft notice and matter summary, before anything is sent. */
function ReviewPage() {
  const { invoices, advocate: advocateId } = Route.useSearch();
  const eligibleQuery = useQuery({
    queryKey: legalQueryKeys.eligible,
    queryFn: () => getEligible(),
    retry: false,
  });
  const advocatesQuery = useQuery({
    queryKey: legalQueryKeys.advocates,
    queryFn: () => getAdvocates(),
    retry: false,
  });

  const back = (
    <Link
      to="/app/legal/advocates"
      search={{ invoices: invoices ?? "" }}
      className="inline-block text-prose font-semibold text-fg-soft hover:text-fg"
    >
      ← Advocates
    </Link>
  );

  if (eligibleQuery.isPending || advocatesQuery.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {back}
        <AppSkeleton className="h-10 w-1/2" />
        <AppSkeleton className="h-96 w-full" />
      </div>
    );
  }
  const error = eligibleQuery.error ?? advocatesQuery.error;
  if (error || !eligibleQuery.data || !advocatesQuery.data) {
    return (
      <div className="space-y-4">
        {back}
        <QueryNotice
          error={error}
          fallback="Couldn't load this review."
          onRetry={() => {
            void eligibleQuery.refetch();
            void advocatesQuery.refetch();
          }}
        />
      </div>
    );
  }

  const selection = selectionSummary(eligibleQuery.data.items, new Set(parseInvoiceIds(invoices)));
  const advocate = advocatesQuery.data.items.find((a) => a.advocate_id === advocateId);
  if (selection.count === 0 || !advocate) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-card border border-hairline bg-card px-5 py-12 text-center">
          <p className="text-section font-bold tracking-tight text-fg">
            Choose invoices and an advocate first.
          </p>
          <p className="mt-1 text-prose text-fg-soft">
            Start from the eligible list, pick a route, then request an advocate.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {back}
      <Review
        key={`${selection.total}:${statutoryRoutesOpen(eligibleQuery.data.seller)}`}
        data={eligibleQuery.data}
        rows={selection.rows}
        total={selection.total}
        advocate={advocate}
      />
    </div>
  );
}

/** The loaded review. */
function Review({
  data,
  rows,
  total,
  advocate,
}: {
  data: EligibleResponse;
  rows: EligibleInvoice[];
  total: string;
  advocate: Advocate;
}) {
  const { orgs } = Route.useRouteContext();
  const orgName = orgs[0]?.name ?? "my client";
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const demandId = useId();
  const statutory = statutoryRoutesOpen(data.seller);
  const [demand, setDemand] = useState(() => defaultDemandText(formatINR(total), statutory));
  const [confirming, setConfirming] = useState(false);

  const accounts = [...new Map(rows.map((row) => [row.account_id, row.account_name])).values()];
  const first = rows.filter((row) => row.account_name === accounts[0]);
  const noticeRows = first.length > 0 ? first : rows;
  const firstTotal = fromPaise(
    noticeRows.reduce((sum, row) => sum + toPaise(row.amount_outstanding), 0n),
  );
  const followUps = noticeRows.reduce((sum, row) => sum + row.follow_ups, 0);
  const oldest = Math.max(...noticeRows.map((row) => row.days_overdue));
  const today = formatShortDate(istDateOf(data.as_of));

  const send = useMutation({
    mutationFn: () =>
      createMatters({
        invoice_ids: rows.map((row) => row.invoice_id),
        advocate_id: advocate.advocate_id,
        route: "advocate_notice",
        demand_text: demand,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: legalQueryKeys.all });
      setConfirming(false);
      toast(
        created.length === 1
          ? `Matter sent to ${advocate.name} for review`
          : `${created.length} matters sent to ${advocate.name} for review`,
      );
      await navigate({ to: "/app/legal/matters" });
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't send the matter.")),
  });

  return (
    <>
      <h1 className="text-title font-bold tracking-tight text-fg">Review before sending</h1>
      <p
        role="status"
        className="rounded-card border border-warn-edge bg-warn-tint px-4 py-3 text-body font-semibold text-warn"
      >
        Nothing has been sent. {advocate.name} will review and finalise this before it goes to your
        client.
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {accounts.length > 1 ? (
            <p className="mb-2 text-prose text-fg-soft">
              Notice 1 of {accounts.length} · {accounts[0]}. The others follow the same text.
            </p>
          ) : null}
          <article className="rounded-card border border-hairline bg-card px-12 py-10 font-serif text-fg">
            <div className="border-b border-fg pb-3 text-center">
              <p className="text-section font-bold tracking-widest uppercase">{advocate.name}</p>
              <p className="text-prose text-fg-soft">
                Advocate · Enrolment No. {advocate.enrolment_number}
              </p>
            </div>
            <div className="mt-5 flex justify-between text-body font-normal">
              <span>By Registered Post A.D. and email</span>
              <span className="tnum">{today}</span>
            </div>
            <p className="mt-4 text-body font-normal">
              To,
              <br />
              The Accounts Department, {accounts[0]}
            </p>
            <p className="mt-4 text-body font-bold">
              Subject: Legal notice for recovery of{" "}
              <span className="tnum">{formatINR(firstTotal)}</span> due under{" "}
              {noticeRows.map((row) => row.invoice_number).join(", ")}
            </p>
            <p className="mt-3 text-body leading-relaxed font-normal">
              Under instructions from and on behalf of my client, {orgName}
              {statutory ? ", a registered micro or small enterprise," : ""} I serve you with the
              following notice.
            </p>
            <p className="mt-3 text-body leading-relaxed font-normal">
              My client supplied goods or services to you under the invoices above, which remain
              unpaid {oldest} days after they fell due. My client sent you {followUps} written
              reminders requesting payment.
            </p>
            <label
              htmlFor={demandId}
              className="mt-4 block font-sans text-eyebrow font-semibold tracking-widest text-fg-muted uppercase"
            >
              Demand · editable
            </label>
            <textarea
              id={demandId}
              value={demand}
              onChange={(event) => setDemand(event.target.value)}
              rows={5}
              className="field mt-1.5 font-serif leading-relaxed"
            />
            <p className="mt-3 text-body leading-relaxed font-normal">
              Should you fail to do so, my client has instructed me to initiate appropriate
              proceedings for recovery
              {statutory
                ? ", including a reference to the Micro and Small Enterprise Facilitation Council or a summary suit under Order XXXVII of the Code of Civil Procedure,"
                : ", including a summary suit under Order XXXVII of the Code of Civil Procedure,"}{" "}
              at your risk as to costs and consequences.
            </p>
            <p className="mt-6 text-body font-normal">
              Yours faithfully,
              <br />
              <br />
              <strong>{advocate.name}</strong>
              <br />
              Advocate
            </p>
          </article>
        </div>

        <aside className="space-y-4 rounded-card border border-hairline bg-card px-5 py-5 lg:sticky lg:top-6 lg:w-96 lg:shrink-0">
          <h2 className="text-section font-bold tracking-tight text-fg">Matter summary</h2>
          <dl className="space-y-2 text-body">
            <SummaryRow label="Matter">
              <span className="tnum">{formatINR(total)}</span>,{" "}
              {rows.length === 1 ? "1 invoice" : `${rows.length} invoices`}
            </SummaryRow>
            <SummaryRow label="Advocate">{advocate.name}</SummaryRow>
            <SummaryRow label="Your cost">
              <span className="tnum">{formatINR(advocate.notice_fee)}</span> to the advocate,{" "}
              <span className="tnum">{formatINR(MATTER_FEE)}</span> to {PRODUCT_NAME}
              {accounts.length > 1 ? `, per matter` : ""}
            </SummaryRow>
            <SummaryRow label="Demand period">15 days</SummaryRow>
          </dl>
          <div className="border-t border-hairline pt-4">
            <p className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
              Sent with the request
            </p>
            <ul className="mt-2 space-y-1.5 text-body font-normal">
              {rows.map((row) => (
                <li key={row.invoice_id} className="flex justify-between gap-3">
                  <span>{row.invoice_number}</span>
                  <span className="text-fg-muted">{row.account_name}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-nav border border-accent-edge bg-accent-tint px-3 py-2 text-prose font-semibold text-accent">
              The request sends these invoice ids, the advocate, and the demand text. This notice
              cites {followUps} follow-ups as prior demand.
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-hairline pt-4">
            <AppButton onClick={() => setConfirming(true)} disabled={demand.trim().length < 20}>
              Send to advocate
            </AppButton>
            <Link
              to="/app/legal"
              className="rounded-pill px-3 py-2 text-body font-semibold text-fg-soft hover:text-fg"
            >
              Cancel
            </Link>
          </div>
        </aside>
      </div>

      <TypeToConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Send this matter to ${advocate.name}?`}
        phrase={accounts[0] ?? ""}
        confirmLabel={accounts.length > 1 ? `Send ${accounts.length} matters` : "Send matter"}
        busy={send.isPending}
        onConfirm={() => send.mutate()}
      >
        <p>
          {advocate.name} will contact {accounts.join(" and ")} directly, on their letterhead. Once
          a notice is issued it can&apos;t be withdrawn quietly.
        </p>
        <p>
          This will likely end your commercial relationship with{" "}
          {accounts.length > 1 ? "these clients" : "this client"}.
        </p>
        <p>
          Total cost:{" "}
          <strong className="tnum">{formatINR(totalMatterCost(advocate.notice_fee))}</strong>
          {accounts.length > 1 ? " per matter" : ""} — {formatINR(advocate.notice_fee)} paid
          directly to the advocate and {formatINR(MATTER_FEE)} to {PRODUCT_NAME} for document
          preparation and tracking.
        </p>
      </TypeToConfirmDialog>
    </>
  );
}

/** A label and value in the matter summary. */
function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="font-normal text-fg-soft">{label}</dt>
      <dd className="col-span-2 font-semibold text-fg">{children}</dd>
    </div>
  );
}
