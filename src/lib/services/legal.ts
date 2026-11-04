import { getPublicEnv } from "@/lib/env.public";
import {
  advocatesResponseSchema,
  attachmentSchema,
  createMatterBodySchema,
  eligibleResponseSchema,
  matterDetailSchema,
  matterListSchema,
  postMessageBodySchema,
  threadMessageSchema,
  updateMatterBodySchema,
  type AdvocatesResponse,
  type Attachment,
  type CreateMatterBody,
  type EligibleResponse,
  type MatterDetail,
  type MatterSummary,
  type PostMessageBody,
  type ThreadMessage,
  type UpdateMatterBody,
} from "@/lib/schemas/legal";
import {
  FeatureApiError,
  featureRequest,
  featureWrite,
  mockDelay,
} from "@/lib/services/feature-api";
import { attachmentError, fromPaise, stageLabel, toPaise } from "@/lib/services/legal-rules";
import { advocatesFixture, legalMockStore, MOCK_CLIENT_NAME } from "@/lib/services/legal.mocks";

/**
 * Legal escalation and matter-record data access, for both sides: the
 * business (`/api/v1/legal/...`) and the advocate portal
 * (`/api/v1/advocate/...`). Screens call these; they never call `fetch`.
 *
 * Same shape as `reports.ts`: mock and network paths end at the same zod
 * parse, so a fixture that drifts from the contract fails where a bad payload
 * would.
 */

const COMING_SOON = "Legal escalation is coming soon.";
const PORTAL_COMING_SOON = "The advocate portal is coming soon.";

export type MatterViewer = "business" | "advocate";

/** Shared with the screens so invalidation and fetch use the same keys. */
export const legalQueryKeys = {
  all: ["legal"] as const,
  eligible: ["legal", "eligible"] as const,
  advocates: ["legal", "advocates"] as const,
  matters: ["legal", "matters"] as const,
  matter: (viewer: MatterViewer, matterId: string) =>
    ["legal", "matter", viewer, matterId] as const,
  advocateMatters: ["legal", "advocate-matters"] as const,
};

/** The path prefix for a viewer's matter endpoints. */
function matterBase(viewer: MatterViewer): string {
  return viewer === "advocate" ? "/advocate/matters" : "/legal/matters";
}

/** The "not built yet" copy for a viewer. */
function comingSoonFor(viewer: MatterViewer): string {
  return viewer === "advocate" ? PORTAL_COMING_SOON : COMING_SOON;
}

/** The time a mock write is stamped with. */
function mockNow(): string {
  return new Date().toISOString();
}

/** `GET /api/v1/legal/eligible` */
export async function getEligible(): Promise<EligibleResponse> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    return eligibleResponseSchema.parse(legalMockStore().eligible);
  }
  const body = await featureRequest("/legal/eligible", { method: "GET" }, COMING_SOON);
  return eligibleResponseSchema.parse(body);
}

/** `GET /api/v1/legal/advocates` */
export async function getAdvocates(): Promise<AdvocatesResponse> {
  if (getPublicEnv().useMocks) {
    await mockDelay(300);
    return advocatesResponseSchema.parse(advocatesFixture);
  }
  const body = await featureRequest("/legal/advocates", { method: "GET" }, COMING_SOON);
  return advocatesResponseSchema.parse(body);
}

/** `GET /api/v1/legal/matters` */
export async function getMatters(): Promise<MatterSummary[]> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    return matterListSchema.parse({ items: legalMockStore().matters }).items;
  }
  const body = await featureRequest("/legal/matters", { method: "GET" }, COMING_SOON);
  return matterListSchema.parse(body).items;
}

/** `GET /api/v1/advocate/matters` */
export async function getAdvocateMatters(): Promise<MatterSummary[]> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    return matterListSchema.parse({ items: legalMockStore().advocateMatters }).items;
  }
  const body = await featureRequest("/advocate/matters", { method: "GET" }, PORTAL_COMING_SOON);
  return matterListSchema.parse(body).items;
}

/**
 * `GET /api/v1/legal/matters/{id}` or `GET /api/v1/advocate/matters/{id}`.
 * The advocate's read marks the matter read (clears `unread`).
 */
export async function getMatter(viewer: MatterViewer, matterId: string): Promise<MatterDetail> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    const store = legalMockStore();
    const found =
      viewer === "advocate" ? store.advocateDetails[matterId] : store.businessDetails[matterId];
    if (!found) throw new FeatureApiError("not_found", "This matter doesn't exist.");
    if (viewer === "advocate") {
      // Opening a matter marks it read, as the real endpoint does.
      store.advocateMatters = store.advocateMatters.map((item) =>
        item.matter_id === matterId ? { ...item, unread: false } : item,
      );
    }
    return matterDetailSchema.parse(found);
  }
  const body = await featureRequest(
    `${matterBase(viewer)}/${encodeURIComponent(matterId)}`,
    { method: "GET" },
    comingSoonFor(viewer),
  );
  return matterDetailSchema.parse(body);
}

/**
 * `POST /api/v1/legal/matters`. Sends the selection to the advocate for
 * review, one matter per customer; nothing reaches a customer until the
 * advocate issues the notice.
 */
export async function createMatters(body: CreateMatterBody): Promise<MatterSummary[]> {
  const payload = createMatterBodySchema.parse(body);
  if (getPublicEnv().useMocks) {
    await mockDelay(400);
    const store = legalMockStore();
    const advocate = advocatesFixture.items.find((a) => a.advocate_id === payload.advocate_id);
    const rows = store.eligible.items.filter((item) =>
      payload.invoice_ids.includes(item.invoice_id),
    );
    if (!advocate || rows.length === 0) {
      throw new FeatureApiError("invalid", "Choose invoices and an advocate.");
    }
    const byAccount = new Map<string, typeof rows>();
    for (const row of rows)
      byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row]);

    const today = mockNow().slice(0, 10);
    const created: MatterSummary[] = [];
    for (const group of byAccount.values()) {
      const first = group[0]!;
      const matterId = crypto.randomUUID();
      const summary: MatterSummary = {
        matter_id: matterId,
        account_id: first.account_id,
        account_name: first.account_name,
        client_name: MOCK_CLIENT_NAME,
        invoice_numbers: group.map((row) => row.invoice_number),
        amount: fromPaise(group.reduce((sum, row) => sum + toPaise(row.amount_outstanding), 0n)),
        route: "advocate_notice",
        advocate: {
          advocate_id: advocate.advocate_id,
          name: advocate.name,
          enrolment_number: advocate.enrolment_number,
        },
        stage: "awaiting_acceptance",
        last_update_on: today,
        next_step: `Waiting for ${advocate.name} to accept`,
        unread: false,
      };
      created.push(summary);
      store.businessDetails[matterId] = {
        ...summary,
        viewer: "business",
        opened_on: today,
        demand_period_days: 15,
        next_deadline: null,
        advocate_accepted: false,
        closed_on: null,
        linked_invoices: group.map((row) => ({
          invoice_id: row.invoice_id,
          invoice_number: row.invoice_number,
          amount_outstanding: row.amount_outstanding,
          days_overdue: row.days_overdue,
        })),
        costs: [
          { label: "Advocate fee", amount: advocate.notice_fee, paid_on: null },
          { label: "Settle Swiftly matter fee", amount: "999.00", paid_on: null },
        ],
        documents: [],
        thread: [
          {
            type: "event",
            entry_id: crypto.randomUUID(),
            at: mockNow(),
            label: `Matter sent to ${advocate.name}`,
            attachments: [],
          },
        ],
        brief: null,
        client_contact: null,
      };
      store.eligible = {
        ...store.eligible,
        open_matter_count: store.eligible.open_matter_count + 1,
        items: store.eligible.items.map((item) =>
          item.account_id === first.account_id && payload.invoice_ids.includes(item.invoice_id)
            ? {
                ...item,
                lock: { reason: "A matter is already open for this invoice.", matter_id: matterId },
              }
            : item,
        ),
      };
    }
    store.matters = [...created, ...store.matters];
    return matterListSchema.parse({ items: created }).items;
  }
  const response = await featureWrite("/legal/matters", "POST", payload, COMING_SOON);
  return matterListSchema.parse(response).items;
}

/** The same matter in both mock views, so a write on one side shows on the other. */
function mockDetails(matterId: string): MatterDetail[] {
  const store = legalMockStore();
  return [store.businessDetails[matterId], store.advocateDetails[matterId]].filter(
    (detail): detail is MatterDetail => detail !== undefined,
  );
}

/** Attachments uploaded under mocks, waiting for the message that carries them. */
const mockUploads = new Map<string, Attachment>();

/**
 * `POST {matter}/attachments` (multipart). Reports progress from 0 to 100.
 * The file is checked before it leaves the browser; the server checks again.
 */
export async function uploadMatterAttachment(
  viewer: MatterViewer,
  matterId: string,
  file: File,
  onProgress: (pct: number) => void,
  signal?: AbortSignal,
): Promise<Attachment> {
  const problem = attachmentError(file);
  if (problem) throw new FeatureApiError("invalid_file", problem);

  if (getPublicEnv().useMocks) {
    for (let pct = 0; pct <= 100; pct += 20) {
      if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
      onProgress(pct);
      await mockDelay(120);
    }
    const attachment: Attachment = {
      document_id: crypto.randomUUID(),
      name: file.name,
      size_bytes: file.size,
      added_by: viewer,
      added_on: mockNow().slice(0, 10),
    };
    mockUploads.set(attachment.document_id, attachment);
    return attachmentSchema.parse(attachment);
  }

  const form = new FormData();
  form.append("file", file);
  onProgress(0);
  const body = await featureRequest(
    `${matterBase(viewer)}/${encodeURIComponent(matterId)}/attachments`,
    { method: "POST", body: form, signal: signal ?? null },
    comingSoonFor(viewer),
  );
  onProgress(100);
  return attachmentSchema.parse(body);
}

/** `POST {matter}/messages`. The message joins the record for both sides. */
export async function postMatterMessage(
  viewer: MatterViewer,
  matterId: string,
  body: PostMessageBody,
  authorName: string,
): Promise<ThreadMessage> {
  const payload = postMessageBodySchema.parse(body);
  if (getPublicEnv().useMocks) {
    await mockDelay(250);
    const attachments = payload.attachment_ids
      .map((id) => mockUploads.get(id))
      .filter((a): a is Attachment => a !== undefined);
    const message: ThreadMessage = {
      type: "message",
      entry_id: crypto.randomUUID(),
      author: { role: viewer, name: authorName },
      sent_at: mockNow(),
      body: payload.body,
      attachments,
      withdrawn_at: null,
    };
    for (const detail of mockDetails(matterId)) {
      detail.thread.push(structuredClone(message));
      detail.documents.push(...structuredClone(attachments));
    }
    return threadMessageSchema.parse(message);
  }
  const response = await featureWrite(
    `${matterBase(viewer)}/${encodeURIComponent(matterId)}/messages`,
    "POST",
    payload,
    comingSoonFor(viewer),
  );
  return threadMessageSchema.parse(response);
}

/**
 * `POST {matter}/messages/{entry}/withdraw`. Nothing is deleted: the entry
 * stays in the record as "Message withdrawn".
 */
export async function withdrawMatterMessage(
  viewer: MatterViewer,
  matterId: string,
  entryId: string,
): Promise<void> {
  if (getPublicEnv().useMocks) {
    await mockDelay(200);
    for (const detail of mockDetails(matterId)) {
      const entry = detail.thread.find((e) => e.entry_id === entryId);
      if (entry?.type === "message") {
        entry.withdrawn_at = mockNow();
        entry.body = "";
      }
    }
    return;
  }
  await featureWrite(
    `${matterBase(viewer)}/${encodeURIComponent(matterId)}/messages/${encodeURIComponent(entryId)}/withdraw`,
    "POST",
    {},
    comingSoonFor(viewer),
  );
}

/**
 * `PATCH /api/v1/advocate/matters/{id}`. A stage or deadline change adds an
 * entry to the record — the record is the audit trail.
 */
export async function updateAdvocateMatter(
  matterId: string,
  body: UpdateMatterBody,
  advocateName: string,
): Promise<void> {
  const payload = updateMatterBodySchema.parse(body);
  if (getPublicEnv().useMocks) {
    await mockDelay(250);
    const store = legalMockStore();
    for (const detail of mockDetails(matterId)) {
      const label =
        detail.stage === "awaiting_acceptance"
          ? `Matter accepted by ${advocateName}`
          : `Stage changed to ${stageLabel(payload.stage)} by ${advocateName}`;
      detail.advocate_accepted = true;
      detail.stage = payload.stage;
      detail.next_deadline = payload.next_deadline_on
        ? { on: payload.next_deadline_on, label: detail.next_deadline?.label ?? "Next deadline" }
        : null;
      detail.thread.push({
        type: "event",
        entry_id: crypto.randomUUID(),
        at: mockNow(),
        label,
        attachments: [],
      });
    }
    const touch = (items: MatterSummary[]) =>
      items.map((item) => (item.matter_id === matterId ? { ...item, stage: payload.stage } : item));
    store.matters = touch(store.matters);
    store.advocateMatters = touch(store.advocateMatters);
    return;
  }
  await featureWrite(
    `/advocate/matters/${encodeURIComponent(matterId)}`,
    "PATCH",
    payload,
    PORTAL_COMING_SOON,
  );
}
