import { Download, FileText } from "lucide-react";

import { TonePill } from "@/components/app/TonePill";
import type { Attachment, MatterDetail, ThreadEntry, ThreadMessage } from "@/lib/schemas/legal";
import {
  fileBadge,
  formatFileSize,
  formatThreadTime,
  groupThreadByDay,
} from "@/lib/services/legal-rules";
import { cn } from "@/lib/utils";

/**
 * The matter record, rendered as a record rather than a chat.
 *
 * It may later be read by a court or the other side, so: every entry carries
 * a name, role and timestamp, always visible; nobody's messages are aligned
 * right or tinted; there are no bubbles, reactions, typing indicators or read
 * receipts; and nothing is deleted — a withdrawn message leaves a visible
 * placeholder. System events are the audit trail and look different from
 * messages on purpose.
 */
type MatterThreadProps = {
  detail: MatterDetail;
  /** Whether a message belongs to whoever is looking at the thread. */
  viewer: "business" | "advocate";
  onWithdraw?: ((entryId: string) => void) | undefined;
  withdrawingId?: string | null;
};

/** The whole thread, split by day. */
export function MatterThread({ detail, viewer, onWithdraw, withdrawingId }: MatterThreadProps) {
  const days = groupThreadByDay(detail.thread);
  if (days.length === 0) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-body font-semibold text-fg">No messages yet.</p>
        <p className="mt-1 text-prose text-fg-soft">
          {detail.advocate
            ? `${detail.advocate.name} will confirm once they've reviewed the matter. You'll get an email.`
            : "Messages and documents about this matter will appear here."}
        </p>
      </div>
    );
  }
  return (
    <ol className="space-y-6" aria-label="Matter record">
      {days.map((day) => (
        <li key={day.day}>
          <DaySeparator label={day.label} />
          <ol className="mt-4 space-y-5">
            {day.entries.map((entry) => (
              <li key={entry.entry_id}>
                <Entry
                  entry={entry}
                  detail={detail}
                  viewer={viewer}
                  onWithdraw={onWithdraw}
                  withdrawing={withdrawingId === entry.entry_id}
                />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

/** A centred hairline carrying the date. */
function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-hairline" />
      <span className="text-eyebrow font-semibold text-fg-muted">{label}</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

/** One entry: an event or a message. */
function Entry({
  entry,
  detail,
  viewer,
  onWithdraw,
  withdrawing,
}: {
  entry: ThreadEntry;
  detail: MatterDetail;
  viewer: "business" | "advocate";
  onWithdraw: MatterThreadProps["onWithdraw"];
  withdrawing: boolean;
}) {
  if (entry.type === "event") {
    return (
      <div className="text-center">
        <p className="inline-flex items-center gap-1.5 text-prose text-fg-muted">
          <FileText className="size-3.5" aria-hidden="true" />
          {entry.label}
        </p>
        {entry.attachments.length > 0 ? (
          <div className="mx-auto mt-2 max-w-xl space-y-2 text-left">
            {entry.attachments.map((file) => (
              <AttachmentCard key={file.document_id} file={file} detail={detail} viewer={viewer} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <Message
      message={entry}
      detail={detail}
      viewer={viewer}
      onWithdraw={onWithdraw}
      withdrawing={withdrawing}
    />
  );
}

/** Initials for an avatar circle: "Meera Raghavan" → "MR". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** A message block: avatar, head line, body, attachments. Left-aligned for everyone. */
function Message({
  message,
  detail,
  viewer,
  onWithdraw,
  withdrawing,
}: {
  message: ThreadMessage;
  detail: MatterDetail;
  viewer: "business" | "advocate";
  onWithdraw: MatterThreadProps["onWithdraw"];
  withdrawing: boolean;
}) {
  const own = message.author.role === viewer;
  const roleLabel = own
    ? "You"
    : message.author.role === "advocate"
      ? "Advocate"
      : detail.client_name;
  const withdrawn = message.withdrawn_at !== null;

  return (
    <article
      className="flex gap-3"
      aria-label={`${message.author.name}, ${formatThreadTime(message.sent_at)}`}
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-alt text-pill font-semibold text-fg-soft"
      >
        {initials(message.author.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-prose">
          <span className="font-semibold text-fg">{message.author.name}</span>
          <TonePill tone={message.author.role === "advocate" && !own ? "green" : "neutral"}>
            {roleLabel}
          </TonePill>
          <time dateTime={message.sent_at} className="tnum text-fg-muted">
            {formatThreadTime(message.sent_at)}
          </time>
          {own && !withdrawn && onWithdraw ? (
            <button
              type="button"
              onClick={() => onWithdraw(message.entry_id)}
              disabled={withdrawing}
              className="ml-auto cursor-pointer text-prose font-semibold text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </button>
          ) : null}
        </p>
        {withdrawn ? (
          <p className="mt-1.5 text-body font-normal text-fg-muted italic">
            Message withdrawn · {formatThreadTime(message.withdrawn_at ?? message.sent_at)}
          </p>
        ) : (
          <>
            {message.body ? (
              <p className="mt-1.5 max-w-prose text-body font-normal whitespace-pre-line text-fg">
                {message.body}
              </p>
            ) : null}
            {message.attachments.length > 0 ? (
              <div className="mt-2 space-y-2">
                {message.attachments.map((file) => (
                  <AttachmentCard
                    key={file.document_id}
                    file={file}
                    detail={detail}
                    viewer={viewer}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </article>
  );
}

/** Who added a file, from the viewer's side. */
function addedByLabel(
  file: Attachment,
  detail: MatterDetail,
  viewer: "business" | "advocate",
): string {
  if (file.added_by === viewer) return "Added by you";
  return file.added_by === "advocate"
    ? `From ${detail.advocate?.name ?? "the advocate"}`
    : `From ${detail.client_name}`;
}

/** A file in the record: type badge, name, size and who added it. */
export function AttachmentCard({
  file,
  detail,
  viewer,
  compact = false,
}: {
  file: Attachment;
  detail: MatterDetail;
  viewer: "business" | "advocate";
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-input border border-hairline bg-card",
        compact ? "px-3 py-2" : "px-3 py-2.5",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-nav bg-alt text-eyebrow font-semibold text-fg-soft">
        {fileBadge(file.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-fg" title={file.name}>
          {file.name}
        </p>
        <p className="text-prose text-fg-muted">
          <span className="tnum">{formatFileSize(file.size_bytes)}</span> ·{" "}
          {addedByLabel(file, detail, viewer)}
        </p>
      </div>
      <button
        type="button"
        disabled
        title="Coming soon"
        aria-label={`Download ${file.name} (coming soon)`}
        className="shrink-0 cursor-not-allowed rounded-nav p-1.5 text-fg-muted opacity-50"
      >
        <Download className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
