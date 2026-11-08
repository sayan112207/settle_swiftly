import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { CalendarDays, LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { AdvocateStatusRail } from "@/components/app/matter/AdvocateStatusRail";
import { ADVOCATE_INSERTS } from "@/components/app/matter/MatterComposer";
import { MatterWorkspace } from "@/components/app/matter/MatterWorkspace";
import { QueryNotice } from "@/components/app/QueryNotice";
import { SidePanel } from "@/components/app/SidePanel";
import { TonePill } from "@/components/app/TonePill";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatINR, formatShortDate } from "@/lib/format";
import type { MatterBrief, MatterDetail, MatterSummary } from "@/lib/schemas/legal";
import { getAuthContext, signOut } from "@/lib/services/auth.service";
import { featureErrorMessage } from "@/lib/services/feature-api";
import {
  getAdvocateMatters,
  getMatter,
  legalQueryKeys,
  updateAdvocateMatter,
} from "@/lib/services/legal";
import { routeLabel, stageLabel, stageTone } from "@/lib/services/legal-rules";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ matter: z.string().uuid().optional().catch(undefined) });

/**
 * The advocate portal: matters sent to this advocate, one conversation at a
 * time. It sits outside /app on purpose — an advocate is not a member of the
 * client's org, so the org guard and the business shell don't apply. The
 * server decides which matters this session may see; a signed-in user with
 * none gets an empty list.
 */
export const Route = createFileRoute("/advocate")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: `Advocate portal — ${PRODUCT_NAME}` }] }),
  beforeLoad: async () => {
    const ctx = await getAuthContext();
    if (!ctx.user) throw redirect({ to: "/login" });
    return { user: ctx.user };
  },
  component: AdvocatePortal,
});

/** Brief rows, in the order an advocate reads them. */
const BRIEF_ROWS: [keyof MatterBrief, string][] = [
  ["claim", "Claim"],
  ["debtor", "Debtor"],
  ["creditor", "Creditor"],
  ["prior_demand", "Prior demand"],
  ["statutory", "Statutory position"],
  ["documents", "Documents"],
];

/** Top bar, matter list, and the open matter. */
function AdvocatePortal() {
  const { user } = Route.useRouteContext();
  const { matter: selectedId } = Route.useSearch();
  const name = user.displayName || user.email || "";
  const mattersQuery = useQuery({
    queryKey: legalQueryKeys.advocateMatters,
    queryFn: () => getAdvocateMatters(),
    retry: false,
  });

  return (
    <div className="app-theme app-shell flex min-h-screen flex-col">
      <PortalBar name={name} />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Matters"
          className={cn(
            "w-full shrink-0 border-r border-hairline bg-subtle lg:block lg:w-80",
            selectedId ? "hidden" : "block",
          )}
        >
          <MatterList query={mattersQuery} selectedId={selectedId} />
        </nav>
        <main className={cn("min-w-0 flex-1 px-4 py-5 lg:block lg:px-8", !selectedId && "hidden")}>
          {selectedId ? (
            <OpenMatter key={selectedId} matterId={selectedId} advocateName={name} />
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <p className="text-prose text-fg-soft">Select a matter to open its record.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Wordmark, who is signed in, and the way out. */
function PortalBar({ name }: { name: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  /** Ends the session and clears cached matters before leaving. */
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      queryClient.clear();
      await navigate({ to: "/login" });
    } catch (error) {
      toast(featureErrorMessage(error, "Couldn't sign out."));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b border-hairline bg-card px-4 py-3 lg:px-6">
      <p className="text-body font-bold tracking-tight text-fg">
        {PRODUCT_NAME} <span className="font-normal text-fg-muted">Advocate portal</span>
      </p>
      <div className="flex items-center gap-3">
        <span className="hidden text-prose text-fg-soft sm:inline">{name}</span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label={signingOut ? "Signing out…" : "Sign out"}
          title="Sign out"
          className="rounded-nav p-1.5 text-fg-muted transition-colors hover:bg-hovered hover:text-fg disabled:opacity-60"
        >
          <LogOut aria-hidden className="size-4" />
        </button>
      </div>
    </header>
  );
}

/** The left column: every matter sent to this advocate, unread first in weight only. */
function MatterList({
  query,
  selectedId,
}: {
  query: UseQueryResult<MatterSummary[]>;
  selectedId: string | undefined;
}) {
  if (query.isPending) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <AppSkeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-4">
        <QueryNotice
          error={query.error}
          fallback="Couldn't load your matters."
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  return (
    <>
      <h1 className="px-4 pt-4 pb-2 text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
        Matters · {query.data.length}
      </h1>
      {query.data.length === 0 ? (
        <p className="px-4 py-6 text-prose text-fg-soft">No matters have been sent to you yet.</p>
      ) : (
        <ul className="space-y-0.5 px-2 pb-4">
          {query.data.map((matter) => (
            <li key={matter.matter_id}>
              <Link
                to="/advocate"
                search={{ matter: matter.matter_id }}
                aria-current={matter.matter_id === selectedId ? "page" : undefined}
                className={cn(
                  "block rounded-nav px-3 py-2.5 transition-colors hover:bg-hovered",
                  matter.matter_id === selectedId && "bg-card",
                )}
              >
                <span className="flex items-center gap-2">
                  {matter.unread ? (
                    <span className="size-2 shrink-0 rounded-pill bg-accent" aria-label="Unread" />
                  ) : null}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-body text-fg",
                      matter.unread ? "font-bold" : "font-semibold",
                    )}
                  >
                    {matter.account_name}
                  </span>
                  <span className="tnum text-prose text-fg-soft">{formatINR(matter.amount)}</span>
                </span>
                <span className="mt-1 flex items-center justify-between gap-2">
                  <TonePill tone={stageTone(matter.stage)}>{stageLabel(matter.stage)}</TonePill>
                  <span className="text-prose text-fg-muted">
                    {formatShortDate(matter.last_update_on)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-prose text-fg-muted">
                  for {matter.client_name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The selected matter, fetched by id. */
function OpenMatter({ matterId, advocateName }: { matterId: string; advocateName: string }) {
  const queryClient = useQueryClient();
  const matterQuery = useQuery({
    queryKey: legalQueryKeys.matter("advocate", matterId),
    queryFn: async () => {
      const matter = await getMatter("advocate", matterId);
      // The read clears `unread`. Refresh the list only after that write lands,
      // so a cached success cannot refetch the list while the dot is still on.
      void queryClient.invalidateQueries({ queryKey: legalQueryKeys.advocateMatters });
      return matter;
    },
    retry: false,
  });

  return (
    <div className="space-y-4" aria-busy={matterQuery.isPending || undefined}>
      <Link
        to="/advocate"
        search={{}}
        className="inline-block text-prose font-semibold text-fg-soft hover:text-fg lg:hidden"
      >
        ← Matters
      </Link>
      {matterQuery.isPending ? (
        <div className="space-y-4">
          <AppSkeleton className="h-24 w-full" />
          <AppSkeleton className="h-96 w-full" />
        </div>
      ) : matterQuery.isError ? (
        <QueryNotice
          error={matterQuery.error}
          fallback="Couldn't load this matter."
          onRetry={() => void matterQuery.refetch()}
        />
      ) : (
        <MatterView detail={matterQuery.data} advocateName={advocateName} />
      )}
    </div>
  );
}

/** Header, brief, acceptance, conversation and status rail for one matter. */
function MatterView({ detail, advocateName }: { detail: MatterDetail; advocateName: string }) {
  const awaiting = detail.stage === "awaiting_acceptance";
  const [statusOpen, setStatusOpen] = useState(false);
  const recipient = detail.client_contact
    ? `${detail.client_contact.name} at ${detail.client_name}`
    : detail.client_name;
  const railKey = `${detail.matter_id}:${detail.stage}:${detail.next_deadline?.on ?? ""}`;

  return (
    <>
      <header className="rounded-card border border-hairline bg-card px-5 py-4">
        <h2 className="text-title font-bold tracking-tight text-fg">
          {detail.client_name} v. {detail.account_name}
        </h2>
        <p className="mt-1 text-prose text-fg-soft">
          <span className="tnum">{formatINR(detail.amount)}</span> ·{" "}
          {detail.invoice_numbers.join(", ")} · {routeLabel(detail.route)} · Opened{" "}
          {formatShortDate(detail.opened_on)}
        </p>
        {detail.next_deadline ? (
          <p className="mt-2 flex items-center gap-1.5 text-prose font-semibold text-warn">
            <CalendarDays className="size-4" aria-hidden="true" />
            {detail.next_deadline.label} due {formatShortDate(detail.next_deadline.on)}
          </p>
        ) : null}
        <AppButton
          variant="secondary"
          className="mt-3 xl:hidden"
          onClick={() => setStatusOpen(true)}
        >
          Status and contact
        </AppButton>
      </header>

      {detail.brief ? <BriefPanel brief={detail.brief} defaultOpen={awaiting} /> : null}
      {awaiting ? <AcceptStrip detail={detail} advocateName={advocateName} /> : null}

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <MatterWorkspace
            detail={detail}
            viewer="advocate"
            authorName={advocateName}
            recipientName={recipient}
            inserts={ADVOCATE_INSERTS}
          />
        </div>
        <aside className="hidden xl:block xl:w-80 xl:shrink-0" aria-label="Matter status">
          <AdvocateStatusRail key={railKey} detail={detail} advocateName={advocateName} />
        </aside>
      </div>

      <p className="text-prose text-fg-muted">
        {PRODUCT_NAME} carries messages and stores documents for this matter. It is not a party to
        it and does not provide legal advice.
      </p>

      <SidePanel open={statusOpen} onOpenChange={setStatusOpen} title="Status and contact">
        <AdvocateStatusRail key={railKey} detail={detail} advocateName={advocateName} />
      </SidePanel>
    </>
  );
}

/** The brief the business prepared, collapsible once the advocate has read it. */
function BriefPanel({ brief, defaultOpen }: { brief: MatterBrief; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-card border border-hairline bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <span className="text-section font-bold tracking-tight text-fg">Matter brief</span>
        <span className="text-prose font-semibold text-accent">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <dl className="grid gap-x-6 gap-y-3 border-t border-hairline px-5 py-4 md:grid-cols-2">
          {BRIEF_ROWS.map(([key, label]) => (
            <div key={key}>
              <dt className="text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
                {label}
              </dt>
              <dd className="mt-0.5 text-body font-normal text-fg">{brief[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

/** Shown until the advocate takes the matter on. */
function AcceptStrip({ detail, advocateName }: { detail: MatterDetail; advocateName: string }) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () =>
      updateAdvocateMatter(
        detail.matter_id,
        { stage: "notice_drafting", next_deadline_on: detail.next_deadline?.on ?? null },
        advocateName,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: legalQueryKeys.all });
      toast("Matter accepted.");
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't accept this matter.")),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-warn-edge bg-warn-tint px-4 py-3">
      <p className="text-prose font-semibold text-warn">
        New matter from {detail.client_name}. Read the brief, then accept it to start work. You can
        ask questions in the thread first.
      </p>
      <AppButton loading={accept.isPending} onClick={() => accept.mutate()}>
        Accept matter
      </AppButton>
    </div>
  );
}
