import type {
  CommercialTerms,
  Offer,
  PaymentPlan,
  TaxDocument,
} from "@/lib/schemas/commercial-terms";

/**
 * Fixture data for Commercial terms under `VITE_USE_MOCKS=true`.
 *
 * Accounts are the ones the accounts, dashboard and reports fixtures already
 * use, and each account's `outstanding` is the figure the Accounts list shows
 * for it, so the same business carries the same balance on every screen.
 * Pinned to the dashboard's Monday, 17 Aug 2026.
 *
 * Typed but not parsed here — the service runs every fixture through the same
 * zod schema as a real response. Interest and GST figures are checked against
 * the rules in `commercial-terms-rules.test.ts`.
 */

/** Same Monday the dashboard and reports fixtures are pinned to. */
export const TERMS_AS_OF = "2026-08-17T09:12:00+05:30";

export const TERMS_ACCOUNT_IDS = {
  sharma: "acc00007-0000-4000-8000-000000000007",
  kaveri: "acc00009-0000-4000-8000-000000000009",
  vertex: "acc00010-0000-4000-8000-000000000010",
  sundaram: "acc00011-0000-4000-8000-000000000011",
  raghav: "acc00012-0000-4000-8000-000000000012",
  coral: "acc00013-0000-4000-8000-000000000013",
  pinnacle: "acc00005-0000-4000-8000-000000000005",
} as const;

export const TERMS_INVOICE_IDS = {
  // Shared with the reports fixture.
  inv1733: "d0c00044-0000-4000-8000-000000001733",
  // Commercial-terms-only rows.
  inv2104: "d0c00060-0000-4000-8000-000000002104",
  inv2096: "d0c00061-0000-4000-8000-000000002096",
  inv1344: "d0c00062-0000-4000-8000-000000001344",
} as const;

export const POLICY_IDS = {
  msme: "f0000001-0000-4000-8000-000000000001",
  standard: "f0000002-0000-4000-8000-000000000002",
  earlyPay: "d1500001-0000-4000-8000-000000000001",
} as const;

export const PLAN_IDS = {
  active: "91a00001-0000-4000-8000-000000000001",
  broken: "91a00002-0000-4000-8000-000000000002",
} as const;

/**
 * The worked invoice behind the payment plan: Sundaram's ₹1,65,000.00 overdue,
 * 71 days past its 7 Jun due date — the "oldest overdue" the Accounts list
 * shows for Sundaram.
 */
export const SUNDARAM_INV_2104 = {
  invoice_id: TERMS_INVOICE_IDS.inv2104,
  invoice_number: "INV-2104",
  account_id: TERMS_ACCOUNT_IDS.sundaram,
  account_name: "Sundaram Industries Pvt Ltd",
  principal: "165000.00",
  due_date: "2026-06-07",
} as const;

export const commercialTermsFixture: CommercialTerms = {
  as_of: TERMS_AS_OF,
  rates: {
    bank_rate_pct: 5.5,
    bank_rate_as_of: "2026-07-19",
    cost_of_capital_pct: 13,
  },
  fee_policies: [
    {
      policy_id: POLICY_IDS.msme,
      name: "MSME statutory",
      basis: "msmed_s16",
      rate_annual_pct: null,
      grace_days: 0,
      compounding: "monthly",
      account_count: 9,
    },
    {
      policy_id: POLICY_IDS.standard,
      name: "Standard terms",
      basis: "contractual",
      rate_annual_pct: 18,
      grace_days: 7,
      compounding: "none",
      account_count: 12,
    },
  ],
  discount_policies: [
    {
      policy_id: POLICY_IDS.earlyPay,
      name: "Standard early pay",
      discount_pct: 1,
      window_days: 10,
      pre_agreed: true,
      active: true,
      account_count: 6,
    },
  ],
  account_terms: [
    {
      account_id: TERMS_ACCOUNT_IDS.sundaram,
      account_name: "Sundaram Industries Pvt Ltd",
      payment_terms_days: 45,
      fee_policy_id: POLICY_IDS.msme,
      discount_policy_id: null,
      interest_enabled: true,
      terms_on_invoice: false,
      udyam_registered: true,
      credit_limit: "200000.00",
      credit_hold: { set_by: "Priya Nair", set_on: "2026-08-11", reason: null },
      outstanding: "220000.00",
      payer_grade: "C",
      payer_grade_note: "Pays 38 days beyond terms · kept 2 of 5 promises",
    },
    {
      account_id: TERMS_ACCOUNT_IDS.kaveri,
      account_name: "Kaveri & Sons",
      payment_terms_days: 30,
      fee_policy_id: POLICY_IDS.msme,
      discount_policy_id: null,
      interest_enabled: false,
      terms_on_invoice: false,
      udyam_registered: true,
      credit_limit: null,
      credit_hold: null,
      outstanding: "295000.00",
      payer_grade: "D",
      payer_grade_note: "Unpaid for 108 days · no primary contact",
    },
    {
      account_id: TERMS_ACCOUNT_IDS.raghav,
      account_name: "Raghav & Co Traders",
      payment_terms_days: 30,
      fee_policy_id: POLICY_IDS.standard,
      discount_policy_id: null,
      interest_enabled: true,
      terms_on_invoice: true,
      udyam_registered: true,
      credit_limit: "250000.00",
      credit_hold: null,
      outstanding: "185000.00",
      payer_grade: "C",
      payer_grade_note: "Pays 41 days beyond terms · missed a plan instalment",
    },
    {
      account_id: TERMS_ACCOUNT_IDS.vertex,
      account_name: "Vertex Labs Pvt Ltd",
      payment_terms_days: 45,
      fee_policy_id: null,
      discount_policy_id: POLICY_IDS.earlyPay,
      interest_enabled: false,
      terms_on_invoice: false,
      udyam_registered: true,
      credit_limit: null,
      credit_hold: null,
      outstanding: "260000.00",
      payer_grade: "B",
      payer_grade_note: "Pays 12 days beyond terms · one open dispute",
    },
    {
      account_id: TERMS_ACCOUNT_IDS.sharma,
      account_name: "Sharma Traders Pvt Ltd",
      payment_terms_days: 30,
      fee_policy_id: null,
      discount_policy_id: null,
      interest_enabled: false,
      terms_on_invoice: false,
      udyam_registered: true,
      credit_limit: null,
      credit_hold: null,
      outstanding: "482000.00",
      payer_grade: "D",
      payer_grade_note: "Unpaid for 94 days · contact email bouncing",
    },
    {
      account_id: TERMS_ACCOUNT_IDS.coral,
      account_name: "Coral Bay Creative",
      payment_terms_days: 30,
      fee_policy_id: POLICY_IDS.standard,
      discount_policy_id: null,
      interest_enabled: false,
      terms_on_invoice: true,
      udyam_registered: true,
      credit_limit: null,
      credit_hold: null,
      outstanding: "140000.00",
      payer_grade: "A",
      payer_grade_note: "Pays within terms · no disputes raised",
    },
  ],
};

/**
 * Three notes awaiting export. GST is 18% of the taxable value, rounded so the
 * parts sum to the total; the interest note is the contractual 18% on
 * Raghav's INV-1733 to 12 Aug, which the rules test recomputes.
 */
export const taxDocumentsFixture: TaxDocument[] = [
  {
    document_id: "7a000041-0000-4000-8000-000000000041",
    number: "CN-0041",
    doc_type: "credit_note",
    invoice_id: TERMS_INVOICE_IDS.inv2096,
    invoice_number: "INV-2096",
    account_id: TERMS_ACCOUNT_IDS.vertex,
    account_name: "Vertex Labs Pvt Ltd",
    taxable: "-1016.95",
    gst: "-183.05",
    total: "-1200.00",
    reason: "Early payment discount 1%",
    state: "draft",
    created_on: "2026-08-14",
  },
  {
    document_id: "7a000042-0000-4000-8000-000000000042",
    number: "CN-0042",
    doc_type: "credit_note",
    invoice_id: TERMS_INVOICE_IDS.inv1344,
    invoice_number: "INV-1344",
    account_id: TERMS_ACCOUNT_IDS.pinnacle,
    account_name: "Pinnacle Industries LLP",
    taxable: "-6101.69",
    gst: "-1098.31",
    total: "-7200.00",
    reason: "Settlement — 15% haircut",
    state: "draft",
    created_on: "2026-08-13",
  },
  {
    document_id: "7a000008-0000-4000-8000-000000000008",
    number: "DN-0008",
    doc_type: "debit_note",
    invoice_id: TERMS_INVOICE_IDS.inv1733,
    invoice_number: "INV-1733",
    account_id: TERMS_ACCOUNT_IDS.raghav,
    account_name: "Raghav & Co Traders",
    taxable: "1997.26",
    gst: "359.51",
    total: "2356.77",
    reason: "Interest claim, contractual 18% to 12 Aug",
    state: "exported",
    created_on: "2026-08-12",
  },
];

/**
 * An active plan on Sundaram's INV-2104 — nothing paid yet, so the interest
 * accrued is on the full principal — and a broken plan on Raghav's INV-1733,
 * whose first instalment was missed.
 */
export const paymentPlansFixture: PaymentPlan[] = [
  {
    plan_id: PLAN_IDS.active,
    invoice_id: SUNDARAM_INV_2104.invoice_id,
    invoice_number: SUNDARAM_INV_2104.invoice_number,
    account_id: SUNDARAM_INV_2104.account_id,
    account_name: SUNDARAM_INV_2104.account_name,
    total: "165000.00",
    status: "active",
    broken_on: null,
    resumed_at_tier: null,
    interest: { accrued: "5345.89", waive_on_completion: true },
    instalments: [
      { seq: 1, due_on: "2026-08-31", amount: "55000.00", paid_amount: "0.00", state: "pending" },
      { seq: 2, due_on: "2026-09-30", amount: "55000.00", paid_amount: "0.00", state: "pending" },
      { seq: 3, due_on: "2026-10-31", amount: "55000.00", paid_amount: "0.00", state: "pending" },
    ],
  },
  {
    plan_id: PLAN_IDS.broken,
    invoice_id: TERMS_INVOICE_IDS.inv1733,
    invoice_number: "INV-1733",
    account_id: TERMS_ACCOUNT_IDS.raghav,
    account_name: "Raghav & Co Traders",
    total: "45000.00",
    status: "broken",
    broken_on: "2026-06-30",
    resumed_at_tier: "P1",
    interest: null,
    instalments: [
      { seq: 1, due_on: "2026-06-30", amount: "15000.00", paid_amount: "0.00", state: "missed" },
      { seq: 2, due_on: "2026-07-31", amount: "15000.00", paid_amount: "0.00", state: "pending" },
      { seq: 3, due_on: "2026-08-31", amount: "15000.00", paid_amount: "0.00", state: "pending" },
    ],
  },
];

/**
 * The mock store. Mutations under `VITE_USE_MOCKS=true` write here, so a
 * created offer or an exported note shows up on the next fetch exactly as it
 * would against the API. `resetCommercialTermsMockStore` puts it back.
 */
type TermsMockStore = {
  terms: CommercialTerms;
  offers: Offer[];
  taxDocuments: TaxDocument[];
  plans: PaymentPlan[];
};

/** A deep copy of the fixtures, so mutating the store never edits them. */
function freshStore(): TermsMockStore {
  return structuredClone({
    terms: commercialTermsFixture,
    offers: [],
    taxDocuments: taxDocumentsFixture,
    plans: paymentPlansFixture,
  });
}

let store: TermsMockStore = freshStore();

/** The live mock store. Mutating it is how the mock service persists writes. */
export function commercialTermsMockStore(): TermsMockStore {
  return store;
}

/** Puts the mock store back to the fixtures. For tests. */
export function resetCommercialTermsMockStore(): void {
  store = freshStore();
}
