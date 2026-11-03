import { z } from "zod";

/**
 * `GET /api/v1/outbox` — what the scheduler queued, sent and could not
 * deliver. See docs/chasing-scheduler-spec.md §10.
 *
 * One payload for all four sub-tabs: the overview is counts over the same
 * rows the other tabs list, so fetching them separately would only let the
 * numbers disagree with the lists beneath them.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const outboxRecipientOutcomeSchema = z.enum([
  "unsent",
  "accepted",
  "delivered",
  "hard_bounced",
  "retry",
]);
export type OutboxRecipientOutcome = z.infer<typeof outboxRecipientOutcomeSchema>;

export const outboxRecipientSchema = z.object({
  contact_id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  outcome: outboxRecipientOutcomeSchema,
  /** The provider's words, when there are any. Shown verbatim. */
  reason: z.string().nullable(),
});
export type OutboxRecipient = z.infer<typeof outboxRecipientSchema>;

export const outboxReminderSchema = z.object({
  id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  invoice_number: z.string(),
  account_id: z.string().uuid(),
  account_name: z.string(),
  step: z.number().int().positive(),
  tone: z.enum(["Gentle", "Standard", "Firm"]),
  status: z.enum(["scheduled", "sent", "failed", "cancelled"]),
  cancel_reason: z.string().nullable(),
  scheduled_for: isoDate,
  sent_at: z.string().nullable(),
  /** Still open and not mid-send. The server re-checks on cancel. */
  can_cancel: z.boolean(),
  recipients: z.array(outboxRecipientSchema),
});
export type OutboxReminder = z.infer<typeof outboxReminderSchema>;

export const outboxAlertSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["address_bounced", "undelivered"]),
  account_id: z.string().uuid(),
  account_name: z.string(),
  contact_id: z.string().uuid(),
  contact_name: z.string(),
  to_email: z.string().nullable(),
  invoice_number: z.string().nullable(),
  reason: z.string(),
  created_at: z.string(),
});
export type OutboxAlert = z.infer<typeof outboxAlertSchema>;

export const outboxSchema = z.object({
  /** The scheduler's date, in IST — "today" on every tab means this day. */
  today: isoDate,
  overview: z.object({
    queued_today: z.number().int().nonnegative(),
    sent_today: z.number().int().nonnegative(),
    cancelled_today: z.number().int().nonnegative(),
    sent_week: z.number().int().nonnegative(),
    recipients_week: z.number().int().nonnegative(),
    delivered_week: z.number().int().nonnegative(),
    bounced_week: z.number().int().nonnegative(),
    /** Accepted by the provider, with no delivery report yet. */
    awaiting_week: z.number().int().nonnegative(),
    /** Delivered over recipients with a known outcome; null until there is one. */
    delivery_rate_pct: z.number().min(0).max(100).nullable(),
    open_alerts: z.number().int().nonnegative(),
  }),
  /** Everything the plan put on today, in step order. */
  today_queue: z.array(outboxReminderSchema),
  /** Reminders sent in the last seven days, newest first. */
  sent: z.array(outboxReminderSchema),
  alerts: z.array(outboxAlertSchema),
});
export type Outbox = z.infer<typeof outboxSchema>;

/** `POST /api/v1/outbox/reminders/{id}/cancel` */
export const outboxCancelSchema = z.object({ cancelled: z.literal(true) });
