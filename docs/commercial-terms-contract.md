# Commercial Terms — Contract Additions

Extends `api-contract.md`. Everything there still holds: snake_case keys, money as decimal strings, calendar dates as `YYYY-MM-DD`, the `{ "error": { "code", "message" } }` envelope, business logic in the backend.

The parser is the source of truth: `src/lib/schemas/commercial-terms.ts`. If this document and the schema disagree, the schema wins and this document is the bug.

**One rule shapes the feature: an invoice's value never changes.** Accrued interest is reported beside the invoice, never inside it. Every real change to what is owed leaves the system as a credit note or debit note that the accountant posts.

---

## 1. What the frontend does today

The frontend works fully against mocks (`VITE_USE_MOCKS=true`). With mocks off, every endpoint below that returns 404, a non-JSON body, or a plain-string `error` is treated as **not built yet**. The screen then shows "coming soon" instead of failing. You can ship these endpoints one at a time.

Computed on the client (pure functions in `commercial-terms-rules.ts`, unit-tested):

- Statutory rate (3× bank rate) and accrued interest for the display line
- Implied annual cost of a discount, and the verdict against cost of capital
- The settlement check (owner approval above a 10% haircut)
- Splitting a payment plan into instalments, including month-end clamping

**The backend must recompute all of these on write.** The client figures are previews. Never trust an `amount` in a POST body without recomputing it.

---

## 2. Endpoints

| Method | Path                                                     | Body                                                      | Returns                    |
| ------ | -------------------------------------------------------- | --------------------------------------------------------- | -------------------------- |
| GET    | `/api/v1/commercial-terms`                               | —                                                         | `CommercialTerms`          |
| PUT    | `/api/v1/commercial-terms/rates`                         | `{ bank_rate_pct, bank_rate_as_of, cost_of_capital_pct }` | `CommercialTerms`          |
| PUT    | `/api/v1/commercial-terms/discount-policies/{policy_id}` | `{ discount_pct, window_days, pre_agreed, active }`       | `CommercialTerms`          |
| GET    | `/api/v1/invoices/{invoice_id}/offers`                   | —                                                         | `{ items: Offer[] }`       |
| POST   | `/api/v1/offers`                                         | `CreateOfferBody` (below)                                 | `Offer`                    |
| GET    | `/api/v1/tax-documents`                                  | —                                                         | `{ items: TaxDocument[] }` |
| POST   | `/api/v1/tax-documents/mark-exported`                    | `{ document_ids: uuid[] }`                                | `204`                      |
| GET    | `/api/v1/payment-plans/{plan_id}`                        | —                                                         | `PaymentPlan`              |

Only owners and admins may call the two PUTs. The Settings screen already hides edit controls for other roles, but the backend must enforce this too: return `403` with a readable `message`.

### `CommercialTerms`

```
as_of               timestamptz
rates               { bank_rate_pct, bank_rate_as_of (date), cost_of_capital_pct }
fee_policies[]      { policy_id, name, basis: contractual|msmed_s16, rate_annual_pct (null for msmed_s16),
                      grace_days, compounding: none|monthly, account_count }
discount_policies[] { policy_id, name, discount_pct (≤10), window_days, pre_agreed, active, account_count }
account_terms[]     { account_id, account_name, payment_terms_days, fee_policy_id, discount_policy_id,
                      interest_enabled, terms_on_invoice, udyam_registered, credit_limit, credit_hold,
                      outstanding, payer_grade: A|B|C|D|null, payer_grade_note }
```

- `credit_hold` is `{ set_by, set_on, reason }` or null.
- `payer_grade_note` is backend-composed, e.g. "Pays 38 days beyond terms · kept 2 of 5 promises".
- `account_terms[].outstanding` must equal the Accounts list's outstanding for the same account. A test checks this against the fixtures.

### `CreateOfferBody` — one shape per kind

```
{ kind: "interest_waiver", invoice_id, amount, expires_on }
{ kind: "early_discount",  invoice_id, amount, expires_on }
{ kind: "settlement",      invoice_id, amount, expires_on }
{ kind: "payment_plan",    invoice_id, amount, instalments: [{ due_on, amount }] (2–12) }
```

**Every new offer lands with `status: "awaiting_approval"`.** Nothing reaches a customer from this call. It goes into the same approval queue as chasing messages.

### `Offer`

```
offer_id, invoice_id, kind, status: awaiting_approval|offered|accepted|expired|withdrawn,
amount, expires_on (date|null), created_at, plan_id (uuid|null)
```

`plan_id` is set once an accepted `payment_plan` offer has been turned into a plan. The offer sheet links to it.

### `TaxDocument`

```
document_id, number ("CN-0041"), doc_type: credit_note|debit_note, invoice_id, invoice_number,
account_id, account_name, taxable (negative for credit notes), gst, total, reason,
state: draft|exported|posted|void, created_on
```

`mark-exported` moves **drafts only**. Ignore ids already exported, posted or void; don't return an error for them.

### `PaymentPlan`

```
plan_id, invoice_id, invoice_number, account_id, account_name, total,
status: active|completed|broken|cancelled, broken_on, resumed_at_tier: P0|P1|P2|null,
interest: { accrued, waive_on_completion } | null,
instalments: [{ seq, due_on, amount, paid_amount, state: pending|part_paid|paid|missed }]
```

---

## 3. Data model sketch

```
fee_policies        id, org_id, name, basis, rate_annual_pct, grace_days, compounding
discount_policies   id, org_id, name, discount_pct, window_days, pre_agreed, active
org_terms_rates     org_id PK, bank_rate_pct, bank_rate_as_of, cost_of_capital_pct
accounts            + fee_policy_id, discount_policy_id, interest_enabled (default false),
                      terms_on_invoice, credit_limit, credit_hold_by, credit_hold_on, credit_hold_reason
offers              id, org_id, invoice_id, kind, status, amount, expires_on, payload jsonb, plan_id, created_by
payment_plans       id, org_id, invoice_id, offer_id, status, broken_on, resumed_at_tier, waive_interest_on_completion
plan_instalments    plan_id, seq, due_on, amount, paid_amount, state      PK (plan_id, seq)
tax_documents       id, org_id, number, doc_type, invoice_id, taxable, gst, total, reason, state, created_on
```

Every table is under org RLS like the rest of the schema. The `tax_documents.number` series is per org and per doc_type. Give it a unique index.

---

## 4. Rules the backend owns

1. **Interest is off by default.** It accrues only where `interest_enabled` is true on the account. A person switches it on. The product never applies interest on its own.
2. **Section 16 (MSMED)** is 3× the RBI bank rate, compounded monthly from the due date. It ignores grace days. It's only available when the org is Udyam-registered as micro or small and is **not a trader**.
3. **Contractual interest** is simple interest from due date + grace days, at the policy rate.
4. **GST on interest.** Collected interest is billed as a debit note with 18% GST, which creates a `tax_documents` row. A waiver creates nothing: the interest was never invoiced.
5. **Discounts and Section 15(3)(b).** A post-invoice discount reduces taxable value only if it was agreed before the invoice (`pre_agreed`). It produces a credit note. Otherwise it's a write-off: offer it as a settlement.
6. **Settlements** below 90% of outstanding need owner approval. The UI asks for a typed confirmation, but the backend must also check the role.
7. **Plans.** A live plan, or an open offer, pauses chasing for that account. A missed instalment marks the plan `broken`, and chasing resumes one tier above where it stood (`resumed_at_tier`).
8. **Bank rate staleness.** The UI warns when `bank_rate_as_of` is older than 60 days. Keep the rate current from the RBI's published bank rate.

---

## 5. Mock behaviour

- Fixtures live in `commercial-terms.mocks.ts`. The clock is 17 Aug 2026 IST. Accounts reuse the existing account mocks.
- Sundaram Industries is on credit hold: ₹2,20,000.00 outstanding against a ₹2,00,000.00 limit.
- There is one active plan and one broken plan. Tax documents are CN-0041, CN-0042 and DN-0008.
- Writes go to an in-memory store, so they survive navigation but not a reload.
