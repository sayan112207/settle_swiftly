import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppButton } from "@/components/app/AppButton";
import { formatINR, formatShortDate } from "@/lib/format";
import type { MatterDetail, MatterStage } from "@/lib/schemas/legal";
import { featureErrorMessage } from "@/lib/services/feature-api";
import { legalQueryKeys, updateAdvocateMatter } from "@/lib/services/legal";
import { ADVOCATE_STAGES, isClosedStage, stageLabel } from "@/lib/services/legal-rules";

/** Hover copy for actions whose backend isn't built yet. */
const COMING_SOON = "Coming soon";

type AdvocateStatusRailProps = {
  detail: MatterDetail;
  /** The signed-in advocate, stamped on the stage-change entry. */
  advocateName: string;
};

/**
 * The advocate's right rail: stage and next deadline (the only things the
 * advocate edits outside the thread), the client's contact, and the fee.
 * Key it by matter, stage and deadline so the form resets when they change.
 */
export function AdvocateStatusRail({ detail, advocateName }: AdvocateStatusRailProps) {
  const accepted = detail.advocate_accepted && detail.stage !== "awaiting_acceptance";
  const fee = detail.costs.find((cost) => cost.label === "Advocate fee") ?? null;

  return (
    <div className="space-y-4">
      <RailCard title="Status">
        {isClosedStage(detail.stage) ? (
          <p className="text-prose text-fg-soft">This matter is closed. The record is read-only.</p>
        ) : accepted ? (
          <StatusForm detail={detail} advocateName={advocateName} />
        ) : (
          <p className="text-prose text-fg-soft">
            Accept the matter to set its stage and deadlines.
          </p>
        )}
      </RailCard>

      {detail.client_contact ? (
        <RailCard title="Client contact">
          <p className="text-body font-semibold text-fg">{detail.client_contact.name}</p>
          <p className="text-prose text-fg-soft">
            {detail.client_contact.role}, {detail.client_name}
          </p>
          <ul className="mt-2 space-y-1 text-prose">
            <li>
              <a
                href={`mailto:${detail.client_contact.email}`}
                className="font-semibold break-all text-accent hover:text-accent-hover"
              >
                {detail.client_contact.email}
              </a>
            </li>
            <li>
              <a
                href={`tel:${detail.client_contact.phone.replace(/\s+/g, "")}`}
                className="tnum font-semibold text-accent hover:text-accent-hover"
              >
                {detail.client_contact.phone}
              </a>
            </li>
          </ul>
        </RailCard>
      ) : null}

      <RailCard title="Fee">
        {fee ? (
          <p className="tnum text-body font-semibold text-fg">
            {formatINR(fee.amount)}
            <span className="font-normal text-fg-soft">
              {" "}
              · {fee.paid_on ? `paid ${formatShortDate(fee.paid_on)}` : "not yet paid"}
            </span>
          </p>
        ) : (
          <p className="text-prose text-fg-soft">No fee recorded yet.</p>
        )}
        <AppButton variant="secondary" className="mt-3" disabled title={COMING_SOON}>
          Raise a fee note
        </AppButton>
      </RailCard>
    </div>
  );
}

/** Stage and next deadline, saved together as one record entry. */
function StatusForm({ detail, advocateName }: AdvocateStatusRailProps) {
  const queryClient = useQueryClient();
  const stageId = useId();
  const deadlineId = useId();
  const [stage, setStage] = useState<MatterStage>(detail.stage);
  const [deadline, setDeadline] = useState(detail.next_deadline?.on ?? "");
  const dirty = stage !== detail.stage || deadline !== (detail.next_deadline?.on ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateAdvocateMatter(
        detail.matter_id,
        { stage, next_deadline_on: deadline === "" ? null : deadline },
        advocateName,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: legalQueryKeys.all });
      toast("Status updated. An entry was added to the matter record.");
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't update the status.")),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save.mutate();
      }}
    >
      <div>
        <label htmlFor={stageId} className="mb-1 block text-prose font-semibold text-fg-soft">
          Stage
        </label>
        <select
          id={stageId}
          value={stage}
          onChange={(event) => setStage(event.target.value as MatterStage)}
          className="field"
        >
          {ADVOCATE_STAGES.map((option) => (
            <option key={option} value={option}>
              {stageLabel(option)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={deadlineId} className="mb-1 block text-prose font-semibold text-fg-soft">
          Next deadline
        </label>
        <input
          id={deadlineId}
          type="date"
          value={deadline}
          onChange={(event) => setDeadline(event.target.value)}
          className="field tnum"
        />
      </div>
      <p className="text-prose text-fg-muted">
        Changing the stage adds an entry to the matter record.
      </p>
      <AppButton type="submit" disabled={!dirty} loading={save.isPending}>
        Update status
      </AppButton>
    </form>
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
