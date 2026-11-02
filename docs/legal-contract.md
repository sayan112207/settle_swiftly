# Legal Escalation and Matters — Contract Additions

Extends `api-contract.md`. It uses the same conventions and the same error envelope. The parser is the source of truth: `src/lib/schemas/legal.ts`.

There are two audiences on one record:

- **The business**, under `/api/v1/legal/...`, signed in to its org.
- **The advocate**, under `/api/v1/advocate/...`. The advocate is signed in but is **not** a member of the client's org.

A matter has one thread and one set of documents. Each side gets its own view of them.

---

## 1. Frontend status

The screens are complete against mocks (`VITE_USE_MOCKS=true`). With mocks off, a 404, a non-JSON body, or a plain-string `error` means **not built yet**. The UI then shows "coming soon": "Legal escalation is coming soon." or "The advocate portal is coming soon."

Some actions are rendered but disabled with a "Coming soon" tooltip until they have endpoints:

- Draft a Section 43B(h) notice
- Prepare an MSEFC filing
- Download an attachment (this needs a signed-URL endpoint)
- Raise a fee note

---

## 2. Business endpoints

| Method | Path                                                      | Body                                                                  | Returns                                                   |
| ------ | --------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/v1/legal/eligible`                                  | —                                                                     | `{ seller, open_matter_count, items: EligibleInvoice[] }` |
| GET    | `/api/v1/legal/advocates`                                 | —                                                                     | `{ jurisdiction, items: Advocate[] }`                     |
| GET    | `/api/v1/legal/matters`                                   | —                                                                     | `{ items: MatterSummary[] }`                              |
| POST   | `/api/v1/legal/matters`                                   | `{ invoice_ids, advocate_id, route: "advocate_notice", demand_text }` | `{ items: MatterSummary[] }` (one per customer)           |
| GET    | `/api/v1/legal/matters/{id}`                              | —                                                                     | `MatterDetail` (`viewer: "business"`, `brief: null`)      |
| POST   | `/api/v1/legal/matters/{id}/attachments`                  | multipart `file`                                                      | `Attachment`                                              |
| POST   | `/api/v1/legal/matters/{id}/messages`                     | `{ body, attachment_ids }`                                            | `ThreadMessage`                                           |
| POST   | `/api/v1/legal/matters/{id}/messages/{entry_id}/withdraw` | —                                                                     | `204`                                                     |

## 3. Advocate endpoints

| Method | Path                                                         | Body                          | Returns                                                                                              |
| ------ | ------------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/advocate/matters`                                   | —                             | `{ items: MatterSummary[] }` (with `unread`)                                                         |
| GET    | `/api/v1/advocate/matters/{id}`                              | —                             | `MatterDetail` (`viewer: "advocate"`, with `brief` and `client_contact`). **Marks the matter read.** |
| PATCH  | `/api/v1/advocate/matters/{id}`                              | `{ stage, next_deadline_on }` | `204`                                                                                                |
| POST   | `/api/v1/advocate/matters/{id}/attachments`                  | multipart `file`              | `Attachment`                                                                                         |
| POST   | `/api/v1/advocate/matters/{id}/messages`                     | `{ body, attachment_ids }`    | `ThreadMessage`                                                                                      |
| POST   | `/api/v1/advocate/matters/{id}/messages/{entry_id}/withdraw` | —                             | `204`                                                                                                |

Access to `/advocate/*` depends on an `advocate_users` row linking the signed-in user to an `advocates` row. A signed-in user without one gets `403`. An advocate sees only matters assigned to them; return `404` for any other matter, not `403`, so ids can't be probed.

---

## 4. Shapes

```
Seller          { udyam_registered, enterprise_size: micro|small|medium|null, is_trader }
EligibleInvoice { invoice_id, invoice_number, account_id, account_name, amount_outstanding,
                  days_overdue (≥90), follow_ups, last_contact_on, lock: { reason, matter_id|null } | null }
Advocate        { advocate_id, name, enrolment_number, practice, location, notice_fee,
                  responds_in_days, languages[], facts[], note }
MatterSummary   { matter_id, account_id, account_name, client_name, invoice_numbers[], amount,
                  route: section_43bh_notice|msefc_reference|advocate_notice|summary_suit,
                  advocate: { advocate_id, name, enrolment_number } | null,
                  stage, last_update_on, next_step, unread }
MatterDetail    MatterSummary + { viewer, opened_on, demand_period_days, next_deadline: { on, label } | null,
                  advocate_accepted, closed_on, linked_invoices[], costs[], documents[], thread[],
                  brief | null, client_contact | null }
ThreadEntry     { type: "message", entry_id, author: { role, name }, sent_at, body, attachments[], withdrawn_at }
              | { type: "event",   entry_id, at, label, attachments[] }
Attachment      { document_id, name, size_bytes, added_by: business|advocate, added_on }
```

**Stages:** `awaiting_acceptance → notice_drafting → notice_issued → awaiting_response → client_responded → recovered | closed`. `recovered` and `closed` make the record read-only.

**Backend-composed strings:** `lock.reason`, `next_step`, event `label`, `next_deadline.label`. They must follow the voice rules in `CLAUDE.md`.

---

## 5. Rules the backend owns

1. **Eligibility.** An invoice is eligible when it is unpaid, at least 90 days past due, and has had at least 4 follow-ups. It is locked (shown but not selectable) when it is disputed or already has an open matter. The total must equal the 90+ aged-debt figure in Reports; a test checks the fixtures.
2. **Statutory routes** (43B(h) notice, MSEFC) are open only to Udyam-registered **micro or small** enterprises that are **not traders**.
3. **Creating matters.** Create one matter per customer account in the selection. Nothing reaches the customer at this point: the advocate reviews and issues the notice. Re-check eligibility and locks inside the transaction.
4. **Fees.** The advocate bills the business directly. The platform takes no share of the advocate's fee. The ₹999.00 matter fee is a separate line item.
5. **No ratings.** Advocates are listed with facts only: enrolment number, practice, courts, stated fee, languages, response time. Don't add ratings, rankings or success rates. Bar Council rules restrict advocate advertising.
6. **The record is append-only.**
   - Withdrawing a message sets `withdrawn_at`, empties `body` in responses, and keeps the entry. Only the author can withdraw.
   - Documents are never deleted.
   - A `PATCH` adds an event entry ("Stage changed to … by …", or "Matter accepted by …" on the first move off `awaiting_acceptance`) and sets `advocate_accepted`.
7. **Attachments.** Accept PDF, JPG, PNG, DOCX and XLSX, up to 25 MB each and up to 10 per message. Re-check the type and size on the server. Store them privately and serve them only through short-lived signed URLs. An upload that isn't attached to a message within 24 hours can be garbage-collected.
8. **Unread.** `unread` is true when a message from the business has arrived since the advocate last opened the matter. `GET /advocate/matters/{id}` clears it.

---

## 6. Data model sketch

```
advocates          id, name, enrolment_number, practice, location, notice_fee, responds_in_days,
                   languages text[], facts text[], note, active
advocate_users     user_id PK → users, advocate_id → advocates
matters            id, org_id, account_id, advocate_id, route, stage, demand_text, demand_period_days,
                   next_deadline_on, next_deadline_label, advocate_accepted, opened_on, closed_on
matter_invoices    matter_id, invoice_id                              PK (matter_id, invoice_id)
matter_entries     id, matter_id, type, author_role, author_user_id, body, sent_at, withdrawn_at, label
matter_documents   id, matter_id, entry_id NULL, name, size_bytes, storage_key, added_by, added_on
matter_costs       matter_id, label, amount, paid_on
matter_reads       matter_id, user_id, last_read_at
```

RLS:

- Business-side rows are scoped by `org_id`, like the rest of the schema.
- Advocate access goes through `matters.advocate_id = (select advocate_id from advocate_users where user_id = auth.uid())`.
- Never give advocates org membership.

---

## 7. Mock behaviour

- Fixtures are in `legal.mocks.ts`. The clock is 17 Aug 2026 IST and the business is "Meridian Traders Co".
- **Eligible:** six invoices. Two are selectable (Kaveri, Raghav). One is locked because it is disputed (Vertex). Three are locked because a matter is open (Sharma ×2, Bhavani).
- **Advocates:** four.
- **Business matters:** Sharma (awaiting response), Bhavani (43B(h), client responded) and Pinnacle (recovered).
- **Advocate (Meera) list:** Sharma, Lakshmi (new and unread), Orbit and Delta.
- Writes go to an in-memory store. That covers new matters, messages, withdrawals, uploads (with simulated progress) and stage changes. They survive navigation but not a reload.
