import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AttachmentCard } from "@/components/app/matter/MatterThread";
import { formatDays, formatINR, formatShortDate } from "@/lib/format";
import type { MatterDetail } from "@/lib/schemas/legal";
import { documentsBySide, routeLabel } from "@/lib/services/legal-rules";

/**
 * The business side's context rail: what the matter is, every document in it,
 * the invoices it covers, and what it has cost. This is what makes the screen
 * a matter workspace rather than a chat box.
 */
export function MatterContextRail({ detail }: { detail: MatterDetail }) {
  const docs = documentsBySide(detail);
  return (
    <div className="space-y-4">
      <RailCard title="Matter">
        <dl className="space-y-2 text-body">
          <RailRow label="Route" value={routeLabel(detail.route)} />
          <RailRow
            label="Advocate"
            value={
              detail.advocate
                ? `${detail.advocate.name} · ${detail.advocate.enrolment_number}`
                : "None — sent by you"
            }
          />
          <RailRow label="Opened" value={formatShortDate(detail.opened_on)} />
          {detail.demand_period_days ? (
            <RailRow
              label="Demand period"
              value={`${detail.demand_period_days} days from service`}
            />
          ) : null}
          {detail.next_deadline ? (
            <RailRow
              label="Next deadline"
              value={`${formatShortDate(detail.next_deadline.on)} · ${detail.next_deadline.label}`}
              tone="warn"
            />
          ) : null}
        </dl>
      </RailCard>

      <RailCard title={`Documents (${detail.documents.length})`}>
        {detail.documents.length === 0 ? (
          <p className="text-prose text-fg-soft">No documents yet.</p>
        ) : (
          <div className="space-y-3">
            <DocGroup label="From you" files={docs.business} detail={detail} />
            <DocGroup
              label={detail.advocate ? "From the advocate" : "Other"}
              files={docs.advocate}
              detail={detail}
            />
          </div>
        )}
      </RailCard>

      <RailCard title="Linked invoices">
        <ul className="space-y-2 text-body">
          {detail.linked_invoices.map((invoice) => (
            <li key={invoice.invoice_id} className="flex items-baseline justify-between gap-3">
              <Link
                to="/app/invoices"
                className="font-semibold text-accent hover:text-accent-hover"
              >
                {invoice.invoice_number}
              </Link>
              <span className="tnum text-fg">{formatINR(invoice.amount_outstanding)}</span>
              <span className="tnum text-prose text-fg-muted">
                {invoice.days_overdue > 0 ? formatDays(invoice.days_overdue) : "Paid"}
              </span>
            </li>
          ))}
        </ul>
      </RailCard>

      {detail.costs.length > 0 ? (
        <RailCard title="Costs">
          <ul className="space-y-2.5 text-prose text-fg-soft">
            {detail.costs.map((cost) => (
              <li key={cost.label} className="flex items-baseline justify-between gap-3">
                <span>
                  {cost.label}
                  <span className="block text-fg-muted">
                    {cost.paid_on ? `Paid ${formatShortDate(cost.paid_on)}` : "Not yet paid"}
                  </span>
                </span>
                <span className="tnum font-semibold text-fg">{formatINR(cost.amount)}</span>
              </li>
            ))}
          </ul>
        </RailCard>
      ) : null}
    </div>
  );
}

/** A titled card in the rail. */
function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card border border-hairline bg-card px-4 py-4">
      <h2 className="mb-3 text-eyebrow font-semibold tracking-widest text-fg-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A label/value pair in the Matter card. */
function RailRow({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div>
      <dt className="text-prose text-fg-muted">{label}</dt>
      <dd className={tone === "warn" ? "font-semibold text-warn" : "font-semibold text-fg"}>
        {value}
      </dd>
    </div>
  );
}

/** One side's documents, compact. */
function DocGroup({
  label,
  files,
  detail,
}: {
  label: string;
  files: MatterDetail["documents"];
  detail: MatterDetail;
}) {
  if (files.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-prose font-semibold text-fg-soft">{label}</p>
      <div className="space-y-1.5">
        {files.map((file) => (
          <AttachmentCard
            key={file.document_id}
            file={file}
            detail={detail}
            viewer="business"
            compact
          />
        ))}
      </div>
    </div>
  );
}
