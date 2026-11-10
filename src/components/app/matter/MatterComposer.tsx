import { Paperclip, RotateCcw, X } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { AppButton } from "@/components/app/AppButton";
import type { AttachmentStaging } from "@/components/app/matter/useAttachmentStaging";
import { formatFileSize } from "@/lib/services/legal-rules";

/** File types the picker offers; the rules check again on the way in. */
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.docx,.xlsx";

/** Documents an advocate can drop a labelled placeholder for. */
export const ADVOCATE_INSERTS = [
  "Legal notice",
  "Reply to client",
  "Statement of account",
  "Fee note",
] as const;

type MatterComposerProps = {
  staging: AttachmentStaging;
  /** Resolves when the message is in the record; rejects to keep the draft. */
  onSend: (body: string) => Promise<void>;
  sending: boolean;
  /** Who will read it, for the placeholder and the record notice. */
  recipientName: string;
  /** Advocate only: offer the Insert menu. */
  inserts?: readonly string[];
};

/**
 * The composer under a matter thread: a growing textarea, the staged files,
 * Attach, and Send. Enter sends; Shift+Enter starts a new line.
 *
 * Staged files upload as they're added (see `useAttachmentStaging`), so Send
 * waits only on uploads still running. A failed send keeps the text.
 */
export function MatterComposer({
  staging,
  onSend,
  sending,
  recipientName,
  inserts,
}: MatterComposerProps) {
  const textareaId = useId();
  const insertId = useId();
  const [body, setBody] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canSend =
    !sending && !staging.uploading && (body.trim().length > 0 || staging.attachmentIds.length > 0);

  /** Sends the draft; clears it only once the record has it. */
  async function send() {
    if (!canSend) return;
    try {
      await onSend(body.trim());
      setBody("");
      staging.clear();
    } catch {
      // The caller has already said what went wrong; the draft stays.
    }
  }

  /** Enter sends, Shift+Enter breaks the line, and IME composition is left alone. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  /** Drops "[Legal notice]" at the cursor. */
  function insert(label: string) {
    const el = textarea.current;
    const token = `[${label}]`;
    if (!el) {
      setBody((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}${token}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="border-t border-hairline bg-card px-4 pt-3 pb-3">
      {staging.staged.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Files to send">
          {staging.staged.map((item) => (
            <li
              key={item.key}
              className={
                item.status === "failed"
                  ? "flex items-center gap-2 rounded-pill bg-danger-tint px-3 py-1 text-prose text-danger"
                  : "flex items-center gap-2 rounded-pill bg-alt px-3 py-1 text-prose text-fg"
              }
            >
              {item.status === "failed" ? (
                <>
                  <span>{item.error}</span>
                  <button
                    type="button"
                    onClick={() => staging.retry(item.key)}
                    className="inline-flex cursor-pointer items-center gap-1 font-semibold"
                  >
                    <RotateCcw className="size-3" aria-hidden="true" /> Retry
                  </button>
                </>
              ) : (
                <>
                  <span className="max-w-48 truncate font-semibold" title={item.file.name}>
                    {item.file.name}
                  </span>
                  <span className="tnum text-fg-muted">
                    {item.status === "uploading"
                      ? `${item.progress}%`
                      : formatFileSize(item.file.size)}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => staging.remove(item.key)}
                aria-label={
                  item.status === "uploading"
                    ? `Cancel upload of ${item.file.name}`
                    : `Remove ${item.file.name}`
                }
                className="cursor-pointer rounded-pill text-fg-muted hover:text-fg"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label htmlFor={textareaId} className="sr-only">
        Message to {recipientName}
      </label>
      <textarea
        id={textareaId}
        ref={textarea}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={onKeyDown}
        rows={Math.min(8, Math.max(2, body.split("\n").length))}
        placeholder={`Write to ${recipientName}`}
        className="field resize-none"
      />

      {staging.rejections.length > 0 ? (
        <ul role="alert" className="mt-2 space-y-1 text-prose text-danger">
          {staging.rejections.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            if (event.target.files) staging.addFiles(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
        <AppButton variant="secondary" onClick={() => fileInput.current?.click()}>
          <Paperclip className="size-3.5" aria-hidden="true" />
          Attach
        </AppButton>
        {inserts ? (
          <>
            <label htmlFor={insertId} className="sr-only">
              Insert a document placeholder
            </label>
            <div className="w-44">
              <select
                id={insertId}
                value=""
                onChange={(event) => {
                  if (event.target.value) insert(event.target.value);
                }}
                className="field"
              >
                <option value="">Insert…</option>
                {inserts.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}
        <span className="ml-auto hidden text-prose text-fg-muted sm:inline">
          Shift + Enter for a new line
        </span>
        <AppButton onClick={() => void send()} disabled={!canSend} loading={sending}>
          Send
        </AppButton>
      </div>
      <p className="mt-2 text-prose text-fg-muted">
        Messages and files here are part of the matter record and are visible to {recipientName}.
      </p>
    </div>
  );
}
