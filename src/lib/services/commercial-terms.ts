import {
  commercialTermsSchema,
  createOfferBodySchema,
  markExportedBodySchema,
  offerListSchema,
  offerSchema,
  paymentPlanSchema,
  taxDocumentListSchema,
  updateDiscountPolicyBodySchema,
  updateRatesBodySchema,
  type CommercialTerms,
  type CreateOfferBody,
  type Offer,
  type PaymentPlan,
  type TaxDocument,
  type UpdateDiscountPolicyBody,
  type UpdateRatesBody,
} from "@/lib/schemas/commercial-terms";
import { getPublicEnv } from "@/lib/env.public";
import { commercialTermsMockStore, TERMS_AS_OF } from "@/lib/services/commercial-terms.mocks";
import {
  FeatureApiError,
  featureRequest,
  featureWrite,
  mockDelay,
} from "@/lib/services/feature-api";

/**
 * Commercial terms data access. Screens call these; they never call `fetch`.
 *
 * Same shape as `reports.ts`: the mock and network paths end at the same
 * `schema.parse(...)`, so a fixture that drifts from the contract fails in
 * development exactly where a bad payload would fail in production.
 */

const COMING_SOON = "Commercial terms are coming soon.";

/** Shared with the screens so invalidation and fetch use the same keys. */
export const commercialTermsQueryKeys = {
  all: ["commercial-terms"] as const,
  terms: ["commercial-terms", "terms"] as const,
  offers: (invoiceId: string) => ["commercial-terms", "offers", invoiceId] as const,
  taxDocuments: ["commercial-terms", "tax-documents"] as const,
  plan: (planId: string) => ["commercial-terms", "plan", planId] as const,
};

/** A fresh id for a record the mock store creates. */
function mockId(): string {
  return crypto.randomUUID();
}

/** `GET /api/v1/commercial-terms` */
export async function getCommercialTerms(): Promise<CommercialTerms> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    return commercialTermsSchema.parse(commercialTermsMockStore().terms);
  }
  const body = await featureRequest("/commercial-terms", { method: "GET" }, COMING_SOON);
  return commercialTermsSchema.parse(body);
}

/** `PUT /api/v1/commercial-terms/rates` */
export async function updateRates(body: UpdateRatesBody): Promise<CommercialTerms> {
  const payload = updateRatesBodySchema.parse(body);
  if (getPublicEnv().useMocks) {
    await mockDelay(250);
    const store = commercialTermsMockStore();
    store.terms = { ...store.terms, rates: payload };
    return commercialTermsSchema.parse(store.terms);
  }
  const response = await featureWrite("/commercial-terms/rates", "PUT", payload, COMING_SOON);
  return commercialTermsSchema.parse(response);
}

/** `PUT /api/v1/commercial-terms/discount-policies/{policy_id}` */
export async function updateDiscountPolicy(
  policyId: string,
  body: UpdateDiscountPolicyBody,
): Promise<CommercialTerms> {
  const payload = updateDiscountPolicyBodySchema.parse(body);
  if (getPublicEnv().useMocks) {
    await mockDelay(250);
    const store = commercialTermsMockStore();
    store.terms = {
      ...store.terms,
      discount_policies: store.terms.discount_policies.map((policy) =>
        policy.policy_id === policyId ? { ...policy, ...payload } : policy,
      ),
    };
    return commercialTermsSchema.parse(store.terms);
  }
  const response = await featureWrite(
    `/commercial-terms/discount-policies/${encodeURIComponent(policyId)}`,
    "PUT",
    payload,
    COMING_SOON,
  );
  return commercialTermsSchema.parse(response);
}

/** `GET /api/v1/invoices/{invoice_id}/offers` */
export async function getInvoiceOffers(invoiceId: string): Promise<Offer[]> {
  if (getPublicEnv().useMocks) {
    await mockDelay(200);
    const items = commercialTermsMockStore().offers.filter((o) => o.invoice_id === invoiceId);
    return offerListSchema.parse({ items }).items;
  }
  const body = await featureRequest(
    `/invoices/${encodeURIComponent(invoiceId)}/offers`,
    { method: "GET" },
    COMING_SOON,
  );
  return offerListSchema.parse(body).items;
}

/**
 * `POST /api/v1/offers`. The new offer always lands in the approval queue:
 * nothing reaches a customer from this call.
 */
export async function createOffer(body: CreateOfferBody): Promise<Offer> {
  const payload = createOfferBodySchema.parse(body);
  if (getPublicEnv().useMocks) {
    await mockDelay(300);
    const offer: Offer = {
      offer_id: mockId(),
      invoice_id: payload.invoice_id,
      kind: payload.kind,
      status: "awaiting_approval",
      amount: payload.amount,
      expires_on: payload.kind === "payment_plan" ? null : payload.expires_on,
      created_at: TERMS_AS_OF,
    };
    const store = commercialTermsMockStore();
    // One live offer of a kind per invoice: a second replaces the first.
    store.offers = [
      ...store.offers.filter((o) => !(o.invoice_id === offer.invoice_id && o.kind === offer.kind)),
      offer,
    ];
    return offerSchema.parse(offer);
  }
  const response = await featureWrite("/offers", "POST", payload, COMING_SOON);
  return offerSchema.parse(response);
}

/** `GET /api/v1/tax-documents` */
export async function getTaxDocuments(): Promise<TaxDocument[]> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    return taxDocumentListSchema.parse({ items: commercialTermsMockStore().taxDocuments }).items;
  }
  const body = await featureRequest(
    "/tax-documents",
    { method: "GET" },
    "Tax documents are coming soon.",
  );
  return taxDocumentListSchema.parse(body).items;
}

/**
 * `POST /api/v1/tax-documents/mark-exported`. Only drafts move: a posted or
 * void note is past the point of export.
 */
export async function markTaxDocumentsExported(documentIds: readonly string[]): Promise<void> {
  const payload = markExportedBodySchema.parse({ document_ids: [...documentIds] });
  if (getPublicEnv().useMocks) {
    await mockDelay(250);
    const ids = new Set(payload.document_ids);
    const store = commercialTermsMockStore();
    store.taxDocuments = store.taxDocuments.map((doc) =>
      ids.has(doc.document_id) && doc.state === "draft" ? { ...doc, state: "exported" } : doc,
    );
    return;
  }
  await featureWrite(
    "/tax-documents/mark-exported",
    "POST",
    payload,
    "Tax documents are coming soon.",
  );
}

/** `GET /api/v1/payment-plans/{plan_id}` */
export async function getPaymentPlan(planId: string): Promise<PaymentPlan> {
  if (getPublicEnv().useMocks) {
    await mockDelay();
    const found = commercialTermsMockStore().plans.find((plan) => plan.plan_id === planId);
    if (!found) throw new FeatureApiError("not_found", "This payment plan doesn't exist.");
    return paymentPlanSchema.parse(found);
  }
  const body = await featureRequest(
    `/payment-plans/${encodeURIComponent(planId)}`,
    { method: "GET" },
    "Payment plans are coming soon.",
  );
  return paymentPlanSchema.parse(body);
}
