import { z } from "zod";

import { moneyString } from "@/lib/schemas/dashboard";

/**
 * Commercial terms: late payment interest, early payment discounts, offers,
 * payment plans and the tax documents they produce. Contract in
 * `docs/commercial-terms-contract.md`.
 *
 * Same conventions as every other contract here: snake_case wire keys, money
 * as plain decimal strings, calendar dates as `YYYY-MM-DD`, every type derived
 * with `z.infer` so the parser stays the single source of truth.
 *
 * One rule shapes the whole feature: an invoice's value never changes. Accrued
 * interest is reported beside it, never inside it, and every real change to
 * what is owed leaves as a credit or debit note.
 */

/** A calendar date. Due dates carry no time component, so no time zone. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be "YYYY-MM-DD"');

/** A rate as a percentage, e.g. 5.5 for 5.50%. */
const ratePct = z.number().min(0).max(100);

/** `contractual` — the org's own terms. `msmed_s16` — Section 16, MSMED Act. */
export const interestBasisSchema = z.enum(["contractual", "msmed_s16"]);

export const feePolicySchema = z.object({
  policy_id: z.string().uuid(),
  name: z.string().min(1),
  basis: interestBasisSchema,
  /** Null for `msmed_s16`: that rate is three times the bank rate, not a setting. */
  rate_annual_pct: ratePct.nullable(),
  grace_days: z.number().int().nonnegative(),
  compounding: z.enum(["none", "monthly"]),
  account_count: z.number().int().nonnegative(),
});

export const discountPolicySchema = z.object({
  policy_id: z.string().uuid(),
  name: z.string().min(1),
  discount_pct: z.number().positive().max(10),
  /** Pay within this many days of the invoice date to qualify. */
  window_days: z.number().int().positive(),
  /**
   * Agreed with the customer before the invoice was issued. Section 15(3)(b)
   * of the CGST Act only lets a post-invoice discount reduce taxable value when
   * it was; otherwise it is a write-off and is offered as a settlement.
   */
  pre_agreed: z.boolean(),
  active: z.boolean(),
  account_count: z.number().int().nonnegative(),
});

export const termsRatesSchema = z.object({
  bank_rate_pct: ratePct,
  bank_rate_as_of: isoDate,
  /** What borrowing costs the org — the bar a discount is measured against. */
  cost_of_capital_pct: ratePct,
});

export const payerGradeSchema = z.enum(["A", "B", "C", "D"]);

export const creditHoldSchema = z.object({
  set_by: z.string().min(1),
  set_on: isoDate,
  reason: z.string().min(1).nullable(),
});

export const accountTermsSchema = z.object({
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  payment_terms_days: z.number().int().positive(),
  fee_policy_id: z.string().uuid().nullable(),
  discount_policy_id: z.string().uuid().nullable(),
  /** Interest is off by default and switched on per account by a person. */
  interest_enabled: z.boolean(),
  /** Interest terms were printed on this customer's invoices. */
  terms_on_invoice: z.boolean(),
  /** The org's Udyam registration covers sales to this account. */
  udyam_registered: z.boolean(),
  credit_limit: moneyString.nullable(),
  credit_hold: creditHoldSchema.nullable(),
  outstanding: moneyString,
  payer_grade: payerGradeSchema.nullable(),
  /** Backend-composed, e.g. "Pays 38 days beyond terms · kept 2 of 5 promises". */
  payer_grade_note: z.string().min(1).nullable(),
});

/** `GET /api/v1/commercial-terms` */
export const commercialTermsSchema = z.object({
  as_of: z.string().datetime({ offset: true }),
  rates: termsRatesSchema,
  fee_policies: z.array(feePolicySchema),
  discount_policies: z.array(discountPolicySchema),
  account_terms: z.array(accountTermsSchema),
});

/** `PUT /api/v1/commercial-terms/rates` */
export const updateRatesBodySchema = termsRatesSchema;

/** `PUT /api/v1/commercial-terms/discount-policies/{policy_id}` */
export const updateDiscountPolicyBodySchema = discountPolicySchema.pick({
  discount_pct: true,
  window_days: true,
  pre_agreed: true,
  active: true,
});

export const offerKindSchema = z.enum([
  "interest_waiver",
  "early_discount",
  "settlement",
  "payment_plan",
]);

/** Every offer waits in the approval queue before anything reaches a customer. */
export const offerStatusSchema = z.enum([
  "awaiting_approval",
  "offered",
  "accepted",
  "expired",
  "withdrawn",
]);

export const offerSchema = z.object({
  offer_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  kind: offerKindSchema,
  status: offerStatusSchema,
  amount: moneyString,
  expires_on: isoDate.nullable(),
  created_at: z.string().datetime({ offset: true }),
  /** Set once an accepted payment-plan offer has become a plan. */
  plan_id: z.string().uuid().nullable(),
});

/** `GET /api/v1/invoices/{invoice_id}/offers` */
export const offerListSchema = z.object({ items: z.array(offerSchema) });

const instalmentDraftSchema = z.object({ due_on: isoDate, amount: moneyString });

/** `POST /api/v1/offers` — one body per kind, so a plan can't arrive without instalments. */
export const createOfferBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("interest_waiver"),
    invoice_id: z.string().uuid(),
    amount: moneyString,
    expires_on: isoDate,
  }),
  z.object({
    kind: z.literal("early_discount"),
    invoice_id: z.string().uuid(),
    amount: moneyString,
    expires_on: isoDate,
  }),
  z.object({
    kind: z.literal("settlement"),
    invoice_id: z.string().uuid(),
    amount: moneyString,
    expires_on: isoDate,
  }),
  z.object({
    kind: z.literal("payment_plan"),
    invoice_id: z.string().uuid(),
    amount: moneyString,
    instalments: z.array(instalmentDraftSchema).min(2).max(12),
  }),
]);

export const taxDocumentTypeSchema = z.enum(["credit_note", "debit_note"]);
export const taxDocumentStateSchema = z.enum(["draft", "exported", "posted", "void"]);

export const taxDocumentSchema = z.object({
  document_id: z.string().uuid(),
  /** "CN-0041" / "DN-0008": the series the accountant will post under. */
  number: z.string().min(1),
  doc_type: taxDocumentTypeSchema,
  invoice_id: z.string().uuid(),
  invoice_number: z.string().min(1),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  /** Negative for credit notes. */
  taxable: moneyString,
  gst: moneyString,
  total: moneyString,
  reason: z.string().min(1),
  state: taxDocumentStateSchema,
  created_on: isoDate,
});

/** `GET /api/v1/tax-documents` */
export const taxDocumentListSchema = z.object({ items: z.array(taxDocumentSchema) });

/** `POST /api/v1/tax-documents/mark-exported` */
export const markExportedBodySchema = z.object({
  document_ids: z.array(z.string().uuid()).min(1),
});

export const instalmentStateSchema = z.enum(["pending", "part_paid", "paid", "missed"]);

export const instalmentSchema = z.object({
  seq: z.number().int().positive(),
  due_on: isoDate,
  amount: moneyString,
  paid_amount: moneyString,
  state: instalmentStateSchema,
});

export const planStatusSchema = z.enum(["active", "completed", "broken", "cancelled"]);

/** `GET /api/v1/payment-plans/{plan_id}` */
export const paymentPlanSchema = z.object({
  plan_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  invoice_number: z.string().min(1),
  account_id: z.string().uuid(),
  account_name: z.string().min(1),
  total: moneyString,
  status: planStatusSchema,
  broken_on: isoDate.nullable(),
  /** The tier chasing resumed at after a break: one rung above where it stood. */
  resumed_at_tier: z.enum(["P0", "P1", "P2"]).nullable(),
  /** Null when interest is off for the account. */
  interest: z
    .object({
      accrued: moneyString,
      waive_on_completion: z.boolean(),
    })
    .nullable(),
  instalments: z.array(instalmentSchema).min(1),
});

export type InterestBasis = z.infer<typeof interestBasisSchema>;
export type FeePolicy = z.infer<typeof feePolicySchema>;
export type DiscountPolicy = z.infer<typeof discountPolicySchema>;
export type TermsRates = z.infer<typeof termsRatesSchema>;
export type PayerGrade = z.infer<typeof payerGradeSchema>;
export type AccountTerms = z.infer<typeof accountTermsSchema>;
export type CommercialTerms = z.infer<typeof commercialTermsSchema>;
export type UpdateRatesBody = z.infer<typeof updateRatesBodySchema>;
export type UpdateDiscountPolicyBody = z.infer<typeof updateDiscountPolicyBodySchema>;
export type OfferKind = z.infer<typeof offerKindSchema>;
export type OfferStatus = z.infer<typeof offerStatusSchema>;
export type Offer = z.infer<typeof offerSchema>;
export type CreateOfferBody = z.infer<typeof createOfferBodySchema>;
export type TaxDocument = z.infer<typeof taxDocumentSchema>;
export type TaxDocumentState = z.infer<typeof taxDocumentStateSchema>;
export type Instalment = z.infer<typeof instalmentSchema>;
export type InstalmentDraft = z.infer<typeof instalmentDraftSchema>;
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;
