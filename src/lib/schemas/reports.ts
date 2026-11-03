import { z } from "zod";

import { agingBucketSchema, moneyString } from "@/lib/schemas/dashboard";

/**
 * The weekly Reports response — `GET /api/v1/reports/weekly`.
 *
 * Same rules as the dashboard contract: snake_case wire keys, money as plain
 * decimal strings, and every type derived with `z.infer` so the parser stays
 * the single source of truth.
 *
 * The backend composes every sentence a user reads (`note`, `reason`,
 * `chase_disabled_reason`). The frontend renders them as sent and never builds
 * one, so the copy stays in one place when the rules behind it change.
 */

/** A calendar month as `YYYY-MM`. Not a date: DSO is reported per month. */
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be "YYYY-MM"');

export const dsoPointSchema = z.object({
  month: yearMonth,
  days: z.number().int().nonnegative(),
});

export const atRiskItemSchema = z.object({
  invoice_id: z.string().uuid(),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  invoice_number: z.string().min(1),
  amount_outstanding: moneyString,
  /** The bucket the invoice sits in today; `note` says what changes next week. */
  bucket: agingBucketSchema,
  note: z.string().min(1),
});

export const callListItemSchema = z.object({
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  reason: z.string().min(1),
});

export const agedDebtItemSchema = z.object({
  invoice_id: z.string().uuid(),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  invoice_number: z.string().min(1),
  amount_outstanding: moneyString,
  /** The section is "90+ days", so anything younger is a backend bug. */
  days_overdue: z.number().int().min(90),
  /** Null when the invoice can be chased; otherwise the user-facing reason. */
  chase_disabled_reason: z.string().min(1).nullable(),
});

export const weeklyReportTilesSchema = z.object({
  collected_this_week: moneyString,
  collected_last_week: moneyString,
  dso_days: z.number().int().nonnegative(),
  dso_at_signup_days: z.number().int().nonnegative(),
  messages_sent: z.number().int().nonnegative(),
  messages_approved_manually: z.number().int().nonnegative(),
  /** An estimate, so one decimal is the most precision it deserves. */
  hours_saved_estimate: z.number().nonnegative(),
});

/**
 * Before the first Monday after signup there is no week to report on. That is
 * a distinct state, not a report full of zeros — zeros would claim a week
 * happened and nothing came in.
 */
const pendingReportSchema = z.object({
  has_report: z.literal(false),
  as_of: z.string().datetime({ offset: true }),
});

const readyReportSchema = z.object({
  has_report: z.literal(true),
  as_of: z.string().datetime({ offset: true }),
  tiles: weeklyReportTilesSchema,
  /** Oldest first; the last point is the current month. */
  dso_series: z.array(dsoPointSchema).min(1),
  at_risk: z.array(atRiskItemSchema),
  call_list: z.array(callListItemSchema),
  aged_debt: z.array(agedDebtItemSchema),
});

/** `GET /api/v1/reports/weekly` */
export const weeklyReportSchema = z.discriminatedUnion("has_report", [
  pendingReportSchema,
  readyReportSchema,
]);

export type DsoPoint = z.infer<typeof dsoPointSchema>;
export type AtRiskItem = z.infer<typeof atRiskItemSchema>;
export type CallListItem = z.infer<typeof callListItemSchema>;
export type AgedDebtItem = z.infer<typeof agedDebtItemSchema>;
export type WeeklyReportTiles = z.infer<typeof weeklyReportTilesSchema>;
export type WeeklyReport = z.infer<typeof weeklyReportSchema>;
export type ReadyWeeklyReport = z.infer<typeof readyReportSchema>;
