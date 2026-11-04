import { z } from "zod";

import { moneyString } from "@/lib/schemas/dashboard";

/** A calendar date. Due dates carry no time component, so no time zone. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be "YYYY-MM-DD"');

/**
 * Legal escalation and the matter record. Contract in `docs/legal-contract.md`.
 *
 * Same conventions as the rest of the API: snake_case, money as decimal
 * strings, calendar dates as `YYYY-MM-DD`, every type from `z.infer`.
 *
 * Settle Swiftly is not a party to any matter. It carries the messages and
 * stores the documents; advocates are independent practitioners who bill the
 * business directly. Sentences a person reads about a matter — next steps,
 * the advocate's brief — are composed by the backend and rendered as sent.
 */

/** Who the org is, as far as the statutory routes care. */
export const sellerSchema = z.object({
  udyam_registered: z.boolean(),
  enterprise_size: z.enum(["micro", "small", "medium"]).nullable(),
  /**
   * Udyam-registered traders get priority-sector lending only, not the
   * MSMED Act's delayed-payment protections, so the statutory routes close.
   */
  is_trader: z.boolean(),
});

export const eligibleInvoiceSchema = z.object({
  invoice_id: z.string().uuid(),
  invoice_number: z.string().min(1),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  amount_outstanding: moneyString,
  /** Eligibility starts at 90 days; anything younger is a backend bug. */
  days_overdue: z.number().int().min(90),
  follow_ups: z.number().int().nonnegative(),
  last_contact_on: isoDate.nullable(),
  /** Why this row can't be selected, or null when it can. Backend-composed. */
  lock: z
    .object({
      reason: z.string().min(1),
      matter_id: z.string().uuid().nullable(),
    })
    .nullable(),
});

/** `GET /api/v1/legal/eligible` */
export const eligibleResponseSchema = z.object({
  as_of: z.string().datetime({ offset: true }),
  seller: sellerSchema,
  items: z.array(eligibleInvoiceSchema),
  open_matter_count: z.number().int().nonnegative(),
});

export const advocateSchema = z.object({
  advocate_id: z.string().uuid(),
  name: z.string().min(1),
  enrolment_number: z.string().min(1),
  practice: z.string().min(1),
  location: z.string().min(1),
  notice_fee: moneyString,
  responds_in_days: z.number().int().positive(),
  languages: z.array(z.string().min(1)).min(1),
  /** Facts only, e.g. "Also files MSEFC references". Never ratings. */
  facts: z.array(z.string().min(1)),
  /** In the advocate's own words. */
  note: z.string().min(1),
});

/** `GET /api/v1/legal/advocates` */
export const advocatesResponseSchema = z.object({
  jurisdiction: z.string().min(1),
  items: z.array(advocateSchema),
});

export const matterRouteSchema = z.enum([
  "section_43bh_notice",
  "msefc_reference",
  "advocate_notice",
  "summary_suit",
]);

export const matterStageSchema = z.enum([
  "awaiting_acceptance",
  "notice_drafting",
  "notice_issued",
  "awaiting_response",
  "client_responded",
  "recovered",
  "closed",
]);

export const advocateRefSchema = z.object({
  advocate_id: z.string().uuid(),
  name: z.string().min(1),
  enrolment_number: z.string().min(1),
});

export const matterSummarySchema = z.object({
  matter_id: z.string().uuid(),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  /** The business that opened the matter — what the advocate's list shows. */
  client_name: z.string().min(1),
  invoice_numbers: z.array(z.string().min(1)).min(1),
  amount: moneyString,
  route: matterRouteSchema,
  advocate: advocateRefSchema.nullable(),
  stage: matterStageSchema,
  last_update_on: isoDate,
  /** Backend-composed, e.g. "Response due 21 Aug". */
  next_step: z.string().min(1),
  /** Advocate view only: a message arrived the advocate hasn't opened. */
  unread: z.boolean(),
});

/**
 * `GET /api/v1/legal/matters`, `GET /api/v1/advocate/matters`, and the
 * response to `POST /api/v1/legal/matters` (one matter per customer).
 */
export const matterListSchema = z.object({ items: z.array(matterSummarySchema) });

/** `POST /api/v1/legal/matters` */
export const createMatterBodySchema = z.object({
  invoice_ids: z.array(z.string().uuid()).min(1),
  advocate_id: z.string().uuid(),
  route: z.literal("advocate_notice"),
  demand_text: z.string().trim().min(20).max(4000),
});

export const attachmentSchema = z.object({
  document_id: z.string().uuid(),
  name: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  added_by: z.enum(["business", "advocate"]),
  added_on: isoDate,
});

const authorSchema = z.object({
  role: z.enum(["business", "advocate"]),
  name: z.string().min(1),
});

export const threadMessageSchema = z.object({
  type: z.literal("message"),
  entry_id: z.string().uuid(),
  author: authorSchema,
  sent_at: z.string().datetime({ offset: true }),
  /** Empty once withdrawn. The entry stays, so the record shows that it did. */
  body: z.string(),
  attachments: z.array(attachmentSchema),
  withdrawn_at: z.string().datetime({ offset: true }).nullable(),
});

export const threadEventSchema = z.object({
  type: z.literal("event"),
  entry_id: z.string().uuid(),
  at: z.string().datetime({ offset: true }),
  /** Backend-composed, e.g. "Notice issued · 03 Aug, 16:30". */
  label: z.string().min(1),
  attachments: z.array(attachmentSchema),
});

export const threadEntrySchema = z.discriminatedUnion("type", [
  threadMessageSchema,
  threadEventSchema,
]);

export const matterBriefSchema = z.object({
  claim: z.string().min(1),
  debtor: z.string().min(1),
  creditor: z.string().min(1),
  prior_demand: z.string().min(1),
  statutory: z.string().min(1),
  documents: z.string().min(1),
});

export const clientContactSchema = z.object({
  name: z.string().min(1),
  /** Job title only, e.g. "Finance". The business name is `client_name`. */
  role: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
});

/**
 * `GET /api/v1/legal/matters/{id}` (business) and
 * `GET /api/v1/advocate/matters/{id}` (advocate). One shape; the advocate view
 * adds the brief and the client contact, which the business never sees.
 */
export const matterDetailSchema = matterSummarySchema.extend({
  viewer: z.enum(["business", "advocate"]),
  opened_on: isoDate,
  demand_period_days: z.number().int().positive().nullable(),
  next_deadline: z.object({ on: isoDate, label: z.string().min(1) }).nullable(),
  advocate_accepted: z.boolean(),
  closed_on: isoDate.nullable(),
  linked_invoices: z.array(
    z.object({
      invoice_id: z.string().uuid(),
      invoice_number: z.string().min(1),
      amount_outstanding: moneyString,
      days_overdue: z.number().int(),
    }),
  ),
  costs: z.array(
    z.object({ label: z.string().min(1), amount: moneyString, paid_on: isoDate.nullable() }),
  ),
  /** Every file in the matter, newest last. */
  documents: z.array(attachmentSchema),
  thread: z.array(threadEntrySchema),
  brief: matterBriefSchema.nullable(),
  client_contact: clientContactSchema.nullable(),
});

/** `POST /api/v1/legal/matters/{id}/messages` (and the advocate equivalent) */
export const postMessageBodySchema = z
  .object({
    body: z.string().trim().max(5000),
    attachment_ids: z.array(z.string().uuid()).max(10),
  })
  .refine((value) => value.body.length > 0 || value.attachment_ids.length > 0, {
    message: "Write a message or attach a file.",
  });

/** `PATCH /api/v1/advocate/matters/{id}` */
export const updateMatterBodySchema = z.object({
  stage: matterStageSchema,
  next_deadline_on: isoDate.nullable(),
});

export type Seller = z.infer<typeof sellerSchema>;
export type EligibleInvoice = z.infer<typeof eligibleInvoiceSchema>;
export type EligibleResponse = z.infer<typeof eligibleResponseSchema>;
export type Advocate = z.infer<typeof advocateSchema>;
export type AdvocatesResponse = z.infer<typeof advocatesResponseSchema>;
export type MatterRoute = z.infer<typeof matterRouteSchema>;
export type MatterStage = z.infer<typeof matterStageSchema>;
export type MatterSummary = z.infer<typeof matterSummarySchema>;
export type CreateMatterBody = z.infer<typeof createMatterBodySchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type ThreadMessage = z.infer<typeof threadMessageSchema>;
export type ThreadEvent = z.infer<typeof threadEventSchema>;
export type ThreadEntry = z.infer<typeof threadEntrySchema>;
export type MatterBrief = z.infer<typeof matterBriefSchema>;
export type MatterDetail = z.infer<typeof matterDetailSchema>;
export type PostMessageBody = z.infer<typeof postMessageBodySchema>;
export type UpdateMatterBody = z.infer<typeof updateMatterBodySchema>;
