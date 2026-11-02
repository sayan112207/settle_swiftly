import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { MatterComposer } from "@/components/app/matter/MatterComposer";
import { MatterThread } from "@/components/app/matter/MatterThread";
import { useAttachmentStaging } from "@/components/app/matter/useAttachmentStaging";
import { formatShortDate } from "@/lib/format";
import type { MatterDetail } from "@/lib/schemas/legal";
import { featureErrorMessage } from "@/lib/services/feature-api";
import {
  legalQueryKeys,
  postMatterMessage,
  withdrawMatterMessage,
  type MatterViewer,
} from "@/lib/services/legal";
import { isClosedStage } from "@/lib/services/legal-rules";
import { cn } from "@/lib/utils";

/**
 * The conversation column of a matter, shared by the business screen and the
 * advocate portal: the record, the drop zone, and the composer — or the
 * read-only bar once the matter is closed.
 */
type MatterWorkspaceProps = {
  detail: MatterDetail;
  viewer: MatterViewer;
  /** The signed-in person's name, stamped on what they send. */
  authorName: string;
  /** Who reads what is sent. */
  recipientName: string;
  inserts?: readonly string[];
};

/** Thread, drop zone and composer for one matter. */
export function MatterWorkspace({
  detail,
  viewer,
  authorName,
  recipientName,
  inserts,
}: MatterWorkspaceProps) {
  const queryClient = useQueryClient();
  const staging = useAttachmentStaging(viewer, detail.matter_id);
  const [dragging, setDragging] = useState(false);
  const closed = isClosedStage(detail.stage) || detail.closed_on !== null;
  const queryKey = legalQueryKeys.matter(viewer, detail.matter_id);
  const threadEnd = useRef<HTMLDivElement>(null);
  const composerBar = useRef<HTMLDivElement>(null);
  const revealLatest = useRef(false);
  const entryCount = detail.thread.length;

  // After the viewer sends, bring their message into view once it's in the record.
  useEffect(() => {
    if (!revealLatest.current) return;
    revealLatest.current = false;
    const end = threadEnd.current;
    if (!end) return;
    // The composer is sticky, so the latest entry has to clear it, not just the viewport.
    const visibleBottom = window.innerHeight - (composerBar.current?.offsetHeight ?? 0) - 16;
    const overshoot = end.getBoundingClientRect().top - visibleBottom;
    if (overshoot > 0) window.scrollBy({ top: overshoot, behavior: "smooth" });
  }, [entryCount]);

  const send = useMutation({
    mutationFn: (body: string) =>
      postMatterMessage(
        viewer,
        detail.matter_id,
        { body, attachment_ids: staging.attachmentIds },
        authorName,
      ),
    onSuccess: async () => {
      revealLatest.current = true;
      await queryClient.invalidateQueries({ queryKey: legalQueryKeys.all });
    },
    onError: (error) =>
      toast(featureErrorMessage(error, "Your message didn't send. It's kept below.")),
  });

  const withdraw = useMutation({
    mutationFn: (entryId: string) => withdrawMatterMessage(viewer, detail.matter_id, entryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast("Message withdrawn. A note stays in the record.");
    },
    onError: (error) => toast(featureErrorMessage(error, "Couldn't withdraw that message.")),
  });

  /** Accepts files dropped anywhere on the column. */
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (closed) return;
    staging.addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div
      className="relative flex min-h-0 flex-col rounded-card border border-hairline bg-card"
      onDragOver={(event) => {
        if (closed || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {viewer === "business" && !detail.advocate_accepted && detail.advocate && !closed ? (
        <p className="rounded-t-card border-b border-warn-edge bg-warn-tint px-4 py-2.5 text-prose font-semibold text-warn">
          {detail.advocate.name} hasn&apos;t opened this matter yet. Sent{" "}
          {formatShortDate(detail.opened_on)}.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 px-5 py-5">
        <MatterThread
          detail={detail}
          viewer={viewer}
          onWithdraw={closed ? undefined : (id) => withdraw.mutate(id)}
          withdrawingId={withdraw.isPending ? (withdraw.variables ?? null) : null}
        />
        <div ref={threadEnd} />
      </div>

      {closed ? (
        <p className="rounded-b-card border-t border-hairline bg-subtle px-4 py-3 text-prose text-fg-soft">
          This matter was closed
          {detail.closed_on ? ` on ${formatShortDate(detail.closed_on)}` : ""}. The record is
          read-only; every message and document stays available.
        </p>
      ) : (
        <div ref={composerBar} className="sticky bottom-0 rounded-b-card">
          <MatterComposer
            staging={staging}
            onSend={async (body) => {
              await send.mutateAsync(body);
            }}
            sending={send.isPending}
            recipientName={recipientName}
            {...(inserts ? { inserts } : {})}
          />
        </div>
      )}

      <div
        aria-hidden={!dragging}
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-card border-2 border-dashed border-accent bg-accent-tint/90 text-center transition-opacity",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="text-section font-bold text-accent">Drop files to attach</p>
        <p className="mt-1 text-prose text-fg-soft">PDF, JPG, PNG, DOCX, XLSX · up to 25 MB each</p>
      </div>
    </div>
  );
}
