import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { MatterContextRail } from "@/components/app/matter/MatterContextRail";
import { MatterWorkspace } from "@/components/app/matter/MatterWorkspace";
import { QueryNotice } from "@/components/app/QueryNotice";
import { SidePanel } from "@/components/app/SidePanel";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatShortDate } from "@/lib/format";
import type { MatterDetail } from "@/lib/schemas/legal";
import { getMatter, legalQueryKeys } from "@/lib/services/legal";
import { routeLabel, stageStrip } from "@/lib/services/legal-rules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/legal/matters/$matterId")({
  head: () => ({ meta: [{ title: `Matter — ${PRODUCT_NAME}` }] }),
  component: MatterPage,
});

/** One matter, as the business sees it: header, record, and context. */
function MatterPage() {
  const { matterId } = Route.useParams();
  const matterQuery = useQuery({
    queryKey: legalQueryKeys.matter("business", matterId),
    queryFn: () => getMatter("business", matterId),
    retry: false,
  });

  return (
    <div className="space-y-5" aria-busy={matterQuery.isPending || undefined}>
      <Link
        to="/app/legal/matters"
        className="inline-block text-prose font-semibold text-fg-soft hover:text-fg"
      >
        ← Matters
      </Link>
      {matterQuery.isPending ? (
        <div className="space-y-4">
          <AppSkeleton className="h-28 w-full" />
          <AppSkeleton className="h-96 w-full" />
        </div>
      ) : matterQuery.isError ? (
        <QueryNotice
          error={matterQuery.error}
          fallback="Couldn't load this matter."
          onRetry={() => void matterQuery.refetch()}
        />
      ) : (
        <Matter detail={matterQuery.data} />
      )}
    </div>
  );
}

/** The loaded matter. */
function Matter({ detail }: { detail: MatterDetail }) {
  const { user } = Route.useRouteContext();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const strip = stageStrip(detail.stage);
  const recipient = detail.advocate?.name ?? "your team";

  return (
    <>
      <header className="rounded-card border border-hairline bg-card px-5 py-4">
        <h1 className="text-title font-bold tracking-tight text-fg">{detail.account_name}</h1>
        <p className="mt-1 text-prose text-fg-soft">
          <span className="tnum">{formatINR(detail.amount)}</span> ·{" "}
          {detail.invoice_numbers.join(", ")} · {routeLabel(detail.route)}
          {detail.advocate ? ` · ${detail.advocate.name}` : ""}
        </p>
        {detail.next_deadline ? (
          <p className="mt-2 flex items-center gap-1.5 text-prose font-semibold text-warn">
            <CalendarDays className="size-4" aria-hidden="true" />
            {detail.next_deadline.label} due {formatShortDate(detail.next_deadline.on)}
          </p>
        ) : null}
        <ol className="mt-4 hidden flex-wrap gap-x-6 gap-y-2 md:flex" aria-label="Matter stages">
          {strip.steps.map((step) => (
            <li
              key={step.label}
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn(
                "border-b-2 pb-1 text-prose font-semibold",
                step.state === "done" && "border-transparent text-accent",
                step.state === "current" && "border-fg text-fg",
                step.state === "todo" && "border-transparent text-fg-muted",
              )}
            >
              {step.label}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-prose font-semibold text-fg md:hidden">{strip.summary}</p>
        <AppButton
          variant="secondary"
          className="mt-3 lg:hidden"
          onClick={() => setDetailsOpen(true)}
        >
          Matter details
        </AppButton>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <MatterWorkspace
            detail={detail}
            viewer="business"
            authorName={user.displayName || user.email || "You"}
            recipientName={recipient}
          />
        </div>
        <aside className="hidden lg:block lg:w-80 lg:shrink-0" aria-label="Matter details">
          <MatterContextRail detail={detail} />
        </aside>
      </div>

      <p className="text-prose text-fg-muted">
        {PRODUCT_NAME} carries messages and stores documents for this matter. It is not a party to
        it and does not provide legal advice.
      </p>

      <SidePanel open={detailsOpen} onOpenChange={setDetailsOpen} title="Matter details">
        <MatterContextRail detail={detail} />
      </SidePanel>
    </>
  );
}
