import { useCallback, useRef, useState } from "react";

import type { Attachment } from "@/lib/schemas/legal";
import { featureErrorMessage } from "@/lib/services/feature-api";
import { uploadMatterAttachment, type MatterViewer } from "@/lib/services/legal";
import { attachmentError } from "@/lib/services/legal-rules";

/**
 * Files staged for the next message: each uploads as soon as it is added, so
 * by the time someone presses Send the files are already in the matter.
 *
 * A failed upload keeps its chip with a Retry, and the message text is never
 * lost — the composer owns that separately.
 */
export type StagedFile =
  | { key: string; file: File; status: "uploading"; progress: number }
  | { key: string; file: File; status: "done"; attachment: Attachment }
  | { key: string; file: File; status: "failed"; error: string };

/** Staging state for one composer. */
export function useAttachmentStaging(viewer: MatterViewer, matterId: string) {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  /** Files rejected before upload; shown once under the composer. */
  const [rejections, setRejections] = useState<string[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const update = useCallback((key: string, next: StagedFile | null) => {
    setStaged((prev) =>
      next === null
        ? prev.filter((s) => s.key !== key)
        : prev.map((s) => (s.key === key ? next : s)),
    );
  }, []);

  const start = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(key, controller);
      uploadMatterAttachment(
        viewer,
        matterId,
        file,
        (progress) => update(key, { key, file, status: "uploading", progress }),
        controller.signal,
      )
        .then((attachment) => update(key, { key, file, status: "done", attachment }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          update(key, {
            key,
            file,
            status: "failed",
            error: featureErrorMessage(error, `Couldn't upload ${file.name}`),
          });
        })
        .finally(() => controllers.current.delete(key));
    },
    [matterId, update, viewer],
  );

  /** Validates and starts uploading each file. */
  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const problems: string[] = [];
      const accepted: StagedFile[] = [];
      for (const file of files) {
        const problem = attachmentError(file);
        if (problem) {
          problems.push(problem);
          continue;
        }
        accepted.push({ key: crypto.randomUUID(), file, status: "uploading", progress: 0 });
      }
      setRejections(problems);
      if (accepted.length === 0) return;
      setStaged((prev) => [...prev, ...accepted]);
      for (const item of accepted) start(item.key, item.file);
    },
    [start],
  );

  /** Removes a chip, cancelling its upload if it is still running. */
  const remove = useCallback(
    (key: string) => {
      controllers.current.get(key)?.abort();
      update(key, null);
    },
    [update],
  );

  /** Tries a failed upload again. */
  const retry = useCallback(
    (key: string) => {
      const item = staged.find((s) => s.key === key);
      if (!item) return;
      update(key, { key, file: item.file, status: "uploading", progress: 0 });
      start(key, item.file);
    },
    [staged, start, update],
  );

  /** Empties the tray after a send. */
  const clear = useCallback(() => {
    setStaged([]);
    setRejections([]);
  }, []);

  return {
    staged,
    rejections,
    addFiles,
    remove,
    retry,
    clear,
    uploading: staged.some((s) => s.status === "uploading"),
    attachmentIds: staged.flatMap((s) => (s.status === "done" ? [s.attachment.document_id] : [])),
  };
}

export type AttachmentStaging = ReturnType<typeof useAttachmentStaging>;
