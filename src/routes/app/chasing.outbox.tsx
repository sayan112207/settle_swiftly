import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { AppSkeleton } from "@/components/app/AppSkeleton";
import { MetricTile } from "@/components/app/MetricTile";
import { PRODUCT_NAME } from "@/lib/brand";
import { formatRelativeTimestamp, formatShortDate, formatTimeOfDay } from "@/lib/format";
import type {
  Outbox,
  OutboxAlert,
  OutboxRecipient,
  OutboxRecipientOutcome,
  OutboxReminder,
} from "@/lib/schemas/outbox";
import { DashboardApiError, dashboardQueryKeys } from "@/lib/services/dashboard";
import {
  cancelOutboxReminder,
  dismissOutboxAlert,
  getOutbox,
  outboxQueryKey,
} from "@/lib/services/outbox";
import { cn } from "@/lib/utils";

const VIEWS = ["overview", "today", "sent", "attention"] as const;
type View = (typeof VIEWS)[number];

const VIEW_LABELS: Record<View, string> = {
  overview: "Overview",
  today: "Today",
  sent: "Sent",
  attention: "Needs attention",
};

export const Route = createFileRoute("/app/chasing/outbox")({
  validateSearch: z.object({ view: z.enum(VIEWS).default("overview").catch("overview") }),
  head: () => ({ meta: [{ title: `Outbox — ${PRODUCT_NAME}` }] }),
  component: OutboxPage,
});

/** Extracts user-facing error message from API error or returns fallback. */
function userFacingMessage(error: unknown, fallback: string): string {
  return error instanceof DashboardApiError ? error.message : fallback;
}

/**
 * Chasing → Outbox (spec §10). The overview first; the detail one click away;
 * every fix a link to the screen that already makes it. The only edits here
 * are cancelling today's reminders and dismissing an alert.
 */
function OutboxPage() {
  const { view } = Route.useSearch();
  const query = useQuery({ queryKey: outboxQueryKey, queryFn: getOutbox, retry: false });
  const outbox = query.data;

  const counts: Partial<Record<View, number>> = outbox
    ? {
        today: outbox.overview.queued_today,
        attention: outbox.alerts.length,
      }
    : {};

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Outbox sections" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v}
            to="/app/chasing/outbox"
            search={{ view: v }}
            role="tab"
            aria-selected={view === v}
            className={cn(
              "rounded-pill px-3 py-1.5 text-body font-semibold",
              view === v ? "bg-accent-tint text-accent-strong" : "text-fg-soft hover:text-fg",
            )}
          >
            {VIEW_LABELS[v]}
            {counts[v] ? <span className="tnum ml-1.5">{counts[v]}</span> : null}
          </Link>
        ))}
      </div>

      {query.isPending ? (
        <OutboxSkeleton />
      ) : query.isError || !outbox ? (
        <div
          role="alert"
          className="rounded-card border border-danger-edge bg-danger-tint px-4 py-3"
        >
          <p className="text-body font-semibold text-danger">
            {userFacingMessage(query.error, "Couldn't load the outbox.")}
          </p>
        </div>
      ) : view === "overview" ? (
        <OverviewView outbox={outbox} />
      ) : view === "today" ? (
        <TodayView outbox={outbox} />
      ) : view === "sent" ? (
        <SentView outbox={outbox} />
      ) : (
        <AttentionView outbox={outbox} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewView({ outbox }: { outbox: Outbox }) {
  const o = outbox.overview;
  const todayLine =
    o.queued_today + o.sent_today + o.cancelled_today === 0
      ? "Nothing planned for today."
      : [
          o.queued_today > 0 ? `${o.queued_today} waiting to send` : null,
          o.sent_today > 0 ? `${o.sent_today} sent` : null,
          o.cancelled_today > 0 ? `${o.cancelled_today} cancelled` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-hairline bg-card px-5 py-4">
        <div className="text-body font-semibold text-fg">
          Today, {formatShortDate(outbox.today)}
        </div>
        <p className="mt-0.5 text-prose text-fg-soft">
          {todayLine} Reminders are planned at 8:00 and sent from 9:00 IST, inside each account's
          send window.
        </p>
        {o.queued_today > 0 ? (
          <Link
            to="/app/chasing/outbox"
            search={{ view: "today" }}
            className="mt-2 inline-block text-body font-semibold text-accent hover:text-accent-hover"
          >
            Review today's queue
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricTile
          to="/app/chasing/outbox"
          search={{ view: "sent" }}
          eyebrow="Sent this week"
          value={String(o.sent_week)}
          subline={`${o.recipients_week} ${o.recipients_week === 1 ? "recipient" : "recipients"}`}
        />
        <MetricTile
          to="/app/chasing/outbox"
          search={{ view: "sent" }}
          eyebrow="Delivered"
          value={o.delivery_rate_pct === null ? "—" : `${o.delivery_rate_pct}%`}
          subline={[
            `${o.delivered_week} delivered`,
            o.bounced_week > 0 ? `${o.bounced_week} bounced` : null,
            o.awaiting_week > 0 ? `${o.awaiting_week} awaiting report` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <MetricTile
          to="/app/chasing/outbox"
          search={{ view: "attention" }}
          eyebrow="Needs attention"
          value={String(o.open_alerts)}
          subline={o.open_alerts === 1 ? "contact to fix" : "contacts to fix"}
          tone={o.open_alerts > 0 ? "danger" : "default"}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

function TodayView({ outbox }: { outbox: Outbox }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: cancelOutboxReminder,
    onSuccess: async () => {
      toast("Reminder cancelled. It won't be sent.");
      await queryClient.invalidateQueries({ queryKey: outboxQueryKey });
    },
    onError: async (error) => {
      toast(userFacingMessage(error, "Couldn't cancel that reminder."));
      await queryClient.invalidateQueries({ queryKey: outboxQueryKey });
    },
  });

  if (outbox.today_queue.length === 0) {
    return (
      <Empty
        title="Nothing planned for today."
        body="The 8:00 plan queues a reminder when an invoice reaches its next cadence step."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {outbox.today_queue.map((r) => (
        <ReminderCard key={r.id} reminder={r}>
          {r.can_cancel ? (
            <AppButton
              variant="secondary"
              onClick={() => cancel.mutate(r.id)}
              loading={cancel.isPending && cancel.variables === r.id}
              disabled={cancel.isPending}
            >
              Cancel
            </AppButton>
          ) : null}
        </ReminderCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sent
// ---------------------------------------------------------------------------

function SentView({ outbox }: { outbox: Outbox }) {
  if (outbox.sent.length === 0) {
    return <Empty title="Nothing sent this week." body="Sent reminders appear here for 7 days." />;
  }
  return (
    <div className="flex flex-col gap-3">
      {outbox.sent.map((r) => (
        <ReminderCard key={r.id} reminder={r}>
          <Link
            to="/app/accounts/$accountId"
            params={{ accountId: r.account_id }}
            search={{ tab: "activity" }}
            className="text-body font-semibold text-accent hover:text-accent-hover"
          >
            Account activity
          </Link>
        </ReminderCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

const ALERT_TITLES: Record<OutboxAlert["kind"], string> = {
  address_bounced: "Email address doesn't exist",
  undelivered: "Reminder not delivered after 7 days",
};

function AttentionView({ outbox }: { outbox: Outbox }) {
  const queryClient = useQueryClient();
  const dismiss = useMutation({
    mutationFn: dismissOutboxAlert,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: outboxQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.summary }),
      ]);
    },
    onError: (error) => toast(userFacingMessage(error, "Couldn't dismiss that alert.")),
  });

  if (outbox.alerts.length === 0) {
    return (
      <Empty title="Nothing needs your attention." body="Every recent reminder reached someone." />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {outbox.alerts.map((a) => (
        <div key={a.id} className="rounded-card border border-hairline bg-card px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-body font-semibold text-fg">
                {ALERT_TITLES[a.kind]} · {a.contact_name}
              </div>
              <div className="mt-0.5 text-prose text-fg-soft">
                {a.account_name}
                {a.invoice_number ? ` · ${a.invoice_number}` : ""}
                {a.to_email ? ` · ${a.to_email}` : ""} · {formatRelativeTimestamp(a.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/app/accounts/$accountId"
                params={{ accountId: a.account_id }}
                search={{ tab: "contacts" }}
                className="rounded-pill bg-accent px-3.5 py-2 text-body font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                Edit contact
              </Link>
              <AppButton
                variant="text"
                onClick={() => dismiss.mutate(a.id)}
                loading={dismiss.isPending && dismiss.variables === a.id}
                disabled={dismiss.isPending}
              >
                Dismiss
              </AppButton>
            </div>
          </div>
          <p className="mt-3 rounded-[10px] bg-subtle px-4 py-3 text-prose text-fg">{a.reason}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<OutboxReminder["status"], string> = {
  scheduled: "Waiting to send",
  failed: "Retrying",
  sent: "Sent",
  cancelled: "Cancelled",
};

const OUTCOME_LABELS: Record<OutboxRecipientOutcome, string> = {
  unsent: "Not sent yet",
  accepted: "Accepted",
  delivered: "Delivered",
  hard_bounced: "Bounced",
  retry: "Retrying",
};

const OUTCOME_CLASSES: Record<OutboxRecipientOutcome, string> = {
  unsent: "bg-alt text-fg-soft",
  accepted: "bg-alt text-fg-soft",
  delivered: "bg-accent-tint text-accent-strong",
  hard_bounced: "bg-danger-tint text-danger",
  retry: "bg-warn-tint text-warn",
};

function ReminderCard({
  reminder: r,
  children,
}: {
  reminder: OutboxReminder;
  children?: React.ReactNode;
}) {
  const when =
    r.status === "sent" && r.sent_at
      ? `Sent ${formatShortDate(r.scheduled_for)}, ${formatTimeOfDay(r.sent_at)}`
      : r.status === "cancelled"
        ? (r.cancel_reason ?? "Cancelled")
        : STATUS_LABELS[r.status];

  return (
    <div className="rounded-card border border-hairline bg-card px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-body font-semibold text-fg">
            {r.account_name} · {r.invoice_number}
          </div>
          <div className="mt-0.5 text-prose text-fg-soft">
            Step {r.step} · {r.tone} · {when}
          </div>
        </div>
        {children}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {r.recipients.map((x) => (
          <RecipientLine key={x.contact_id} recipient={x} />
        ))}
      </ul>
    </div>
  );
}

function RecipientLine({ recipient: x }: { recipient: OutboxRecipient }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-prose">
      <span
        className={cn(
          "inline-flex items-center rounded-pill px-2.5 py-0.5 text-pill font-semibold",
          OUTCOME_CLASSES[x.outcome],
        )}
      >
        {OUTCOME_LABELS[x.outcome]}
      </span>
      <span className="font-semibold text-fg">{x.name}</span>
      {x.email ? <span className="text-fg-soft">{x.email}</span> : null}
      {x.reason && x.outcome !== "delivered" ? (
        <span className="text-fg-soft">— {x.reason}</span>
      ) : null}
    </li>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-hairline bg-card p-14 text-center">
      <div className="max-w-md">
        <h2 className="text-section font-bold text-fg">{title}</h2>
        <p className="mt-1.5 text-prose text-fg-soft">{body}</p>
      </div>
    </div>
  );
}

function OutboxSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading outbox">
      {Array.from({ length: 3 }, (_, i) => (
        <AppSkeleton key={i} className="h-[88px] w-full" />
      ))}
    </div>
  );
}
