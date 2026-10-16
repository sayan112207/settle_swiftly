import { z } from "zod";

/**
 * SMTP2GO wire shapes, verified against the live API rather than the docs —
 * the published reference for `/activity/search` 404s, and the endpoint
 * silently ignores parameters it does not recognise, so "no error" proves
 * nothing. Everything here was observed on a real request.
 */

/**
 * One delivery event.
 *
 * Only `email_id`, `date` and `event` are relied on; the rest are passed
 * through so the raw payload keeps its detail. `recipient` is absent on
 * `processed` and literally `"*"` on `rejected`, so it is optional — it
 * discriminates recipients of the same message, it does not identify them.
 */
export const activityEventSchema = z
  .object({
    email_id: z.string(),
    date: z.string(),
    event: z.string(),
    recipient: z.string().optional(),
    to: z.string().optional(),
    sender: z.string().optional(),
    subject: z.string().optional(),
    /** The remote server's verbatim reply — the only readable reason a send failed. */
    smtp_response: z.string().optional(),
  })
  // Unknown keys are kept: the raw event is stored whole, and a field this
  // schema has not met yet must not be dropped on the way to the database.
  .passthrough();

export const activitySearchResponseSchema = z.object({
  data: z.object({
    events: z.array(activityEventSchema),
    total_events: z.number().int().nonnegative().optional(),
    /** Present only when more pages remain. Verified: pages do not overlap. */
    continue_token: z.string().optional(),
  }),
});

/**
 * `/email/send`'s success-shaped body.
 *
 * "Success-shaped" is not "succeeded": a send refused by the provider still
 * returns HTTP 200 with `succeeded: 0`, `failed: 1` and `email_id: ""`.
 * Observed live, from an unverified sender domain.
 */
export const sendResponseSchema = z.object({
  data: z.object({
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    failures: z.array(z.string()).default([]),
    email_id: z.string().default(""),
  }),
});

/** `/email/send`'s HTTP 400 body: a malformed address never reaches a mail server. */
export const apiErrorResponseSchema = z.object({
  data: z.object({
    error: z.string(),
    error_code: z.string().optional(),
    field_validation_errors: z
      .object({ fieldname: z.string().optional(), message: z.string().optional() })
      .optional(),
  }),
});

export type ActivityEvent = z.infer<typeof activityEventSchema>;
