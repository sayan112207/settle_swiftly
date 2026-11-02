import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CirclePause, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { DataTable, type Column } from "@/components/app/DataTable";
import { QueryNotice } from "@/components/app/QueryNotice";
import { TonePill, type PillTone } from "@/components/app/TonePill";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatShortDate } from "@/lib/format";
import type { Instalment, PaymentPlan } from "@/lib/schemas/commercial-terms";
import {
  commercialTermsQueryKeys,
  createOffer,
  getPaymentPlan,
} from "@/lib/services/commercial-terms";
import { formatPercent, planProgress } from "@/lib/services/commercial-terms-rules";
import { featureErrorMessage } from "@/lib/services/feature-api";

export const Route = createFileRoute("/app/payment-plans/$planId")({
  head: () => ({ meta: [{ title: `Payment plan — ${PRODUCT_NAME}` }] }),
  component: PaymentPlanPage,
});

const PLAN_STATUS: Record<PaymentPlan["status"], { label: string; tone: PillTone }> = {
  active: { label: "Plan active", tone: "green" },
  completed: { label: "Plan completed", tone: "green" },
  broken: { label: "Plan broken", tone: "danger" },
  cancelled: { label: "Plan cancelled", tone: "neutral" },
};

const INSTALMENT_STATE: Record<Instalment["state"], { label: string; tone: PillTone }> = {
  paid: { label: "Paid", tone: "green" },
  part_paid: { label: "Part paid", tone: "warn" },
  pending: { label: "Pending", tone: "neutral" },
  missed: { label: "Missed", tone: "danger" },
};

/** One payment plan: why chasing is paused, how far through it is, and the schedule. */
function PaymentPlanPage() {
  const { planId } = Route.useParams();
  const planQuery = useQuery({
    queryKey: commercialTermsQueryKeys.plan(planId),
    queryFn: () => getPaymentPlan(planId),
    retry: false,
  });

  return (
    <div className="space-y-6" aria-busy={planQuery.isPending || undefined}>
      <Link
        to="/app/invoices"
        className="inline-block text-prose font-semibold text-fg-soft hover:text-fg"
      >
        ← Invoices
      </Link>
      {planQuery.isPending ? (
        <div className="space-y-4">
          <AppSkeleton className="h-12 w-full" />
          <AppSkeleton className="h-32 w-full" />
          <AppSkeleton className="h-48 w-full" />
        </div>
      ) : planQuery.isError ? (
        <QueryNotice
          error={planQuery.error}
          fallback="Couldn't load this payment plan."
          onRetry={() => void planQuery.refetch()}
        />
      ) : (
        <PlanDetail plan={planQuery.data} />
      )}
    </div>
  );
}

/** The loaded plan. */
function PlanDetail({ plan }: { plan: PaymentPlan }) {
  const progress = planProgress(plan);
  const status = PLAN_STATUS[plan.status];
  const nextSeq = plan.status === "active" ? progress.next?.seq : undefined;

  const columns: Column<Instalment>[] = [
    { id: "seq", header: "#", text: (row) => String(row.seq) },
    { id: "due", header: "Due", text: (row) => formatShortDate(row.due_on) },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => <span className="tnum">{formatINR(row.amount)}</span>,
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      cell: (row) =>
        row.paid_amount === "0.00" ? (
          <span className="text-fg-muted">—</span>
        ) : (
          <span className="tnum">{formatINR(row.paid_amount)}</span>
        ),
    },
    {
      id: "state",
      header: "State",
      cell: (row) =>
        row.seq === nextSeq ? (
          <TonePill tone="ink">Next</TonePill>
        ) : (
          <TonePill tone={INSTALMENT_STATE[row.state].tone}>
            {INSTALMENT_STATE[row.state].label}
          </TonePill>
        ),
    },
  ];

  return (
    <>
      <PlanBanner plan={plan} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-6">
          <section className="rounded-card border border-hairline bg-card px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-section font-bold tracking-tight text-fg">
                {plan.invoice_number} · {plan.account_name}
              </h1>
              <TonePill tone={status.tone}>{status.label}</TonePill>
            </div>
            <dl className="tnum mt-5 grid grid-cols-3 gap-4">
              <Figure label="Total" value={formatINR(plan.total)} />
              <Figure label="Paid" value={formatINR(progress.paid)} />
              <Figure label="Remaining" value={formatINR(progress.remaining)} />
            </dl>
            <div
              className="mt-5 h-1.5 w-full overflow-hidden rounded-pill bg-hairline"
              role="progressbar"
              aria-label="Paid so far"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.pct}
            >
              <div
                className="h-full rounded-pill bg-accent"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            <p className="mt-2 text-prose text-fg-muted">
              {progress.paidCount} of {progress.count} instalments paid ·{" "}
              {formatPercent(progress.pct)}
            </p>
          </section>

          <div className="overflow-hidden rounded-card border border-hairline bg-card">
            <DataTable
              columns={columns}
              rows={plan.instalments}
              rowKey={(row) => String(row.seq)}
              isRowSelected={(row) => row.seq === nextSeq}
            />
          </div>
        </div>

        {plan.interest ? <InterestAside plan={plan} accrued={plan.interest.accrued} /> : null}
      </div>
    </>
  );
}

/** One of the three headline figures. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-title font-bold tracking-tight text-fg">{value}</dd>
      <dt className="mt-1 text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
        {label}
      </dt>
    </div>
  );
}

/** What the plan means for chasing, stated first. */
function PlanBanner({ plan }: { plan: PaymentPlan }) {
  if (plan.status === "broken") {
    const missed = plan.instalments.find((row) => row.state === "missed");
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-card border border-danger-edge bg-danger-tint px-4 py-3 text-body font-semibold text-danger"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          This plan was broken
          {plan.broken_on ? ` on ${formatShortDate(plan.broken_on)}` : ""}
          {missed ? ` — instalment ${missed.seq} was missed` : ""}.
          {plan.resumed_at_tier ? ` Chasing has resumed at ${plan.resumed_at_tier}.` : ""}
        </span>
      </p>
    );
  }
  if (plan.status === "active") {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-card border border-accent-edge bg-accent-tint px-4 py-3 text-body font-semibold text-accent"
      >
        <CirclePause className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Chasing is paused while this plan is being honoured. It resumes immediately if an instalment
        is missed.
      </p>
    );
  }
  return (
    <p role="status" className="rounded-card bg-alt px-4 py-3 text-body font-semibold text-fg-soft">
      {plan.status === "completed"
        ? "This plan is complete. Chasing for this invoice has ended."
        : "This plan was cancelled. Chasing follows the account's normal cadence."}
    </p>
  );
}

/** Accrued interest during the plan, and the option to waive it early. */
function InterestAside({ plan, accrued }: { plan: PaymentPlan; accrued: string }) {
  const queryClient = useQueryClient();
  const progress = planProgress(plan);
  const waive = useMutation({
    mutationFn: () =>
      createOffer({
        kind: "interest_waiver",
        invoice_id: plan.invoice_id,
        amount: accrued,
        expires_on: progress.next?.due_on ?? plan.instalments[plan.instalments.length - 1]!.due_on,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: commercialTermsQueryKeys.offers(plan.invoice_id),
      });
      toast("Waiver offer sent for approval");
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't create the waiver.")),
  });

  return (
    <aside className="rounded-card border border-hairline bg-card px-5 py-5 lg:w-70 lg:shrink-0">
      <h2 className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
        Interest
      </h2>
      <p className="mt-3 text-prose text-fg-soft">
        <span className="tnum font-semibold text-fg">{formatINR(accrued)}</span> accrued and still
        accruing during this plan.
        {plan.interest?.waive_on_completion
          ? " Waived automatically when the final instalment clears."
          : ""}
      </p>
      <AppButton
        variant="secondary"
        className="mt-4 w-full"
        loading={waive.isPending}
        onClick={() => waive.mutate()}
        disabled={plan.status !== "active"}
      >
        Waive now instead
      </AppButton>
    </aside>
  );
}
