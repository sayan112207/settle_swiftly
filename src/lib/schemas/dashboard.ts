import { z } from "zod";

/**
 * The Dashboard response bodies from `docs/api-contract.md` §3.
 *
 * Keys are snake_case because that is what the API sends. These schemas are the
 * boundary: they describe the wire format exactly, and nothing downstream should
 * see a shape the contract does not define.
 *
 * Every type here is derived with `z.infer`. Do not add a parallel interface —
 * a hand-written type can drift from the parser and then the parser is no
 * longer the source of truth.
 */

/**
 * Money crosses the wire as a decimal string ("1840000.00"), never a float.
 * Postgres `numeric(14,2)` serialises this way and it is deliberate: a JSON
 * number would round paise before the frontend ever saw the value.
 *
 * The pattern rejects the two failure modes that actually happen — a number
 * sent instead of a string (caught by `z.string()`) and a pre-formatted display
 * value like "18,40,000" or "₹1,840,000" sneaking in from the backend.
 */
export const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Money must be a plain decimal string, e.g. "1840000.00"');

/** One decimal maximum, per the formatting rules. Range-checked so a garbage
 *  percentage fails here rather than rendering as a 4000%-wide bar segment. */
const percentage = z.number().min(0).max(100);

/** Exact strings from the fixed vocabulary. No variants, no casing drift. */
export const priorityBandSchema = z.enum(["Chase now", "Watch", "Escalate"]);

/** Note the en dashes (–), not hyphens. "Not yet due" is never "Current". */
export const agingBucketSchema = z.enum(["Not yet due", "1–30", "31–60", "61–90", "90+"]);

export const agingSegmentSchema = z.object({
  bucket: agingBucketSchema,
  amount: moneyString,
  share_pct: percentage,
});

/** Contract order, left to right. The bar renders this array as-is. */
function agingSlot<B extends z.infer<typeof agingBucketSchema>>(bucket: B) {
  return z.object({
    bucket: z.literal(bucket),
    amount: moneyString,
    share_pct: percentage,
  });
}

/** `GET /api/v1/dashboard/summary` */
export const dashboardSummarySchema = z.object({
  as_of: z.string().datetime({ offset: true }),
  stale: z.boolean(),
  tiles: z.object({
    total_outstanding: moneyString,
    account_count: z.number().int().nonnegative(),
    overdue: moneyString,
    overdue_share_pct: percentage,
    open_invoice_count: z.number().int().nonnegative(),
    missing_contact_account_count: z.number().int().nonnegative(),
  }),
  /**
   * A tuple, not an array of length 5: the contract freezes both membership
   * and left-to-right order, and the frontend renders this as-is. A plain
   * `.length(5)` would accept a shuffled or duplicated set and the bar would
   * paint the wrong colours on the wrong amounts.
   */
  aging: z.tuple([
    agingSlot("Not yet due"),
    agingSlot("1–30"),
    agingSlot("31–60"),
    agingSlot("61–90"),
    agingSlot("90+"),
  ]),
  attention: z.object({
    accounts_without_p0: z.number().int().nonnegative(),
    disputes_open: z.number().int().nonnegative(),
    promises_broken_this_week: z.number().int().nonnegative(),
  }),
});

export const chaseQueueItemSchema = z.object({
  invoice_id: z.string().uuid(),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  invoice_number: z.string().min(1),
  amount_outstanding: moneyString,
  days_overdue: z.number().int(),
  priority_band: priorityBandSchema,
  /** Composed by the backend. The frontend never builds this string. */
  priority_reason: z.string().min(1),
});

/** `GET /api/v1/dashboard/chase-queue?limit=6` */
export const chaseQueueSchema = z.object({
  total_eligible: z.number().int().nonnegative(),
  items: z.array(chaseQueueItemSchema),
});

export const chaseSkippedSchema = z.object({
  invoice_id: z.string().uuid(),
  /** Why the server refused, e.g. "Disputed". Shown to the user as sent. */
  reason: z.string().min(1),
});

/** `POST /api/v1/chases` — 202 response */
export const chaseResponseSchema = z.object({
  queued: z.number().int().nonnegative(),
  skipped: z.array(chaseSkippedSchema),
});

/**
 * The standard 4xx/5xx envelope.
 *
 * `message` is user-facing copy written by the backend and displayed verbatim,
 * which is why it is parsed rather than replaced with a string of our own.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export type PriorityBand = z.infer<typeof priorityBandSchema>;
export type AgingBucket = z.infer<typeof agingBucketSchema>;
export type AgingSegment = z.infer<typeof agingSegmentSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type ChaseQueueItem = z.infer<typeof chaseQueueItemSchema>;
export type ChaseQueue = z.infer<typeof chaseQueueSchema>;
export type ChaseSkipped = z.infer<typeof chaseSkippedSchema>;
export type ChaseResponse = z.infer<typeof chaseResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
