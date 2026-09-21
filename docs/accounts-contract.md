# Accounts Section — Contract Additions

Extends `api-contract.md`. Everything there still holds: money as decimal strings, receivables carried gross, the error envelope, business logic in the backend.

**This is the first part of the product with mutations.** The Dashboard was read-only plus one append-only action. Everything below the read section changes stored state, which brings concurrency, validation, and rollback into scope for the first time.

---

## 1. Data model additions

The Dashboard build already defined `organisations`, `users`, `accounts`, `contacts`, `invoices`. Add:

### `accounts` — new columns

```
paused_at            timestamptz
pause_reason         text
paused_until         date
default_credit_days  int  not null  default 30
currency             text  not null  default 'INR'
tds_section          tds_section
tds_rate             numeric(5,2)
owner_user_id        UUID  FK users
notes                text
p1_after_days        int  not null  default 21
p2_after_days        int  not null  default 45
last_synced_at       timestamptz
```

Enum `tds_section`: `194C | 194J | 194H | 194I | None`

Check constraint: `p2_after_days > p1_after_days`. Enforce in the database, not only in the form — the form is not the only writer.

### `contacts` — new columns

```
designation      text
channel_email    boolean  not null  default true
channel_whatsapp boolean  not null  default false
channel_sms      boolean  not null  default false
always_cc        boolean  not null  default false
do_not_contact   boolean  not null  default false
dnc_reason       text
language         text  not null  default 'en'
last_bounced_at  timestamptz
last_contacted_at timestamptz
sort_order       int  not null  default 0
```

**Drop the unique index on `(account_id, tier)`.** Multiple contacts may share a tier — two AP staff both receive the P0 message. The Dashboard build created it; it is wrong and must be removed by migration.

Replace it with a partial index for the rule that does hold:

```sql
CREATE INDEX contacts_p0_active
  ON contacts (account_id)
  WHERE tier = 'P0' AND do_not_contact = false;
```

### `payments` and `payment_allocations`

```
payments
  id · org_id · account_id · received_on date · amount numeric(14,2)
  source payment_source · reference text · created_at

payment_allocations
  id · payment_id · invoice_id · amount numeric(14,2)
```

Enum `payment_source`: `Bank alert | Manual | Statement`

Unapplied credit is derived: `payment.amount - sum(allocations.amount)`. Never stored.

### `activity_log`

```
id · org_id · account_id · actor_user_id (nullable — system events)
kind activity_kind · summary text · invoice_id · contact_id · occurred_at
```

Enum `activity_kind`: `invoice_created | invoice_edited | import | payment_received | promise_made | promise_broken | dispute_raised | contact_added | contact_edited | contact_removed | escalation_changed | settings_changed | bounce | pause | resume | message_sent`

`summary` is the plain sentence, composed by the backend. The frontend renders it verbatim and never builds it from parts.

---

## 2. Business rules

### 2.1 Chase-status resolution

`services/chase_status.py::resolve(account) -> ChaseStatus` — the single function that answers "can this account be chased". First match wins:

| Order | Condition                                                  | Status       | Label         |
| ----- | ---------------------------------------------------------- | ------------ | ------------- |
| 1     | no contact with `tier='P0'` and `do_not_contact=false`     | `no_p0`      | `Can't chase` |
| 2     | every usable P0 has `delivery_state='bounced'`             | `bounced_p0` | `Can't chase` |
| 3     | `paused_at` is set and (`paused_until` is null or ≥ today) | `paused`     | `Paused`      |
| 4     | otherwise                                                  | `active`     | `Active`      |

`no_p0` and `bounced_p0` share a label but are different problems and must stay distinct in the payload. The frontend renders different pips for each; collapsing them loses the fix the user needs to make.

This function is also what `eligible_invoices` from the Dashboard build calls. **Do not reimplement the P0 check there** — refactor it to use this.

### 2.2 Derived account figures

Per account, computed not stored:

```
outstanding      = Σ (amount_gross - amount_paid) for open invoices
overdue          = Σ same, where days_overdue > 0
open_count       = count of open invoices
oldest_overdue   = max(days_overdue), null when none
avg_days_late    = mean of (paid_on - due_date) over the last 12 months
                   of fully-paid invoices, minimum 3 samples, else null
```

`avg_days_late` is payment history, not open exposure. It does not derive from the open invoices, and `null` renders as `—`, never `0`.

### 2.3 Contact-tier rules

- Multiple contacts per tier allowed.
- Changing a tier is a plain update to one row. It never reorders or demotes another contact.
- **Removing or marking `do_not_contact` on the last usable P0 is rejected** with `409` and code `last_p0_required`. The account would silently become unchaseable otherwise.
- **A channel may not be on without the detail it sends to**: `channel_email` needs an email address, `channel_whatsapp` and `channel_sms` need a phone number. Enforced by the `contacts_channel_reachable` check constraint, because `contacts_reachable` only asks for one of the two — an email-only contact still defaults to `channel_email = true` and can have WhatsApp switched on. A violation is a `422` with code `channel_unreachable`. Reminders queued against a number that does not exist make an account read as chased while nothing goes out.
- Setting `delivery_state='bounced'` is a system action from the mail provider, never a user edit.
- **Changing a contact's email resets `delivery_state` to `unverified` and clears `last_bounced_at`.** Not an exception to the rule above: the verdict was about the address that has just been replaced, and a new address has no delivery history. Without this, correcting a bouncing contact leaves the account on `bounced_p0` — "Can't chase" — for an address it no longer holds, which is the state the bounce strip sends people to Contacts to clear.
- A `PATCH` carries only the fields the editor actually changed. `If-Match` is the account's whole ladder, so it cannot distinguish an edit of this contact from a channel toggled on another card; sending the untouched fields back would overwrite a concurrent edit that the token was never going to catch.

### 2.4 Pausing

- Pausing requires a reason. Empty reason is a `422`.
- `paused_until` in the past is rejected.
- Pausing does not remove invoices from aging buckets. Aging is exposure; pausing is intent.
- Resuming clears all three pause columns in one transaction.

---

## 3. Endpoints

### Reads

```
GET /api/v1/accounts?filter=&sort=&dir=&page=
```

```json
{
  "total_count": 47,
  "filtered_count": 12,
  "filtered_outstanding": "3637000.00",
  "filtered_overdue": "1994000.00",
  "org_totals": {
    "account_count": 47,
    "outstanding": "5000000.00",
    "overdue": "2800000.00"
  },
  "items": [
    {
      "account_id": "…",
      "name": "Sharma Traders Pvt Ltd",
      "outstanding": "482000.00",
      "overdue": "310000.00",
      "open_count": 9,
      "oldest_overdue_days": 94,
      "avg_days_late": 34,
      "contacts": { "p0": "bounced", "p1": "present", "p2": "present" },
      "chase_status": "bounced_p0",
      "status_label": "Can't chase"
    }
  ]
}
```

`contacts.pN` is one of `present | missing | bounced | dnc`. Four states, not a boolean — the frontend needs to render each differently.

`filter` accepts `has_overdue`, `missing_contacts`, `paused`, repeatable. `sort` is a column name; `dir` is `asc|desc`.

```
GET /api/v1/accounts/{id}                 header, aging, chase_status, settings
GET /api/v1/accounts/{id}/invoices        grouped by bucket, each with subtotal
GET /api/v1/accounts/{id}/contacts        ladder + p1_after_days + p2_after_days
GET /api/v1/accounts/{id}/payments        payments, allocations, unapplied
GET /api/v1/accounts/{id}/activity?limit= reverse chronological
```

The invoices response returns groups, not a flat list — the subtotal per bucket is the backend's to compute:

```json
{ "groups": [ { "bucket": "31–60", "subtotal": "116000.00", "invoices": [ … ] } ] }
```

### Mutations

```
POST   /api/v1/accounts                      { names: [ … ] }
POST   /api/v1/accounts/{id}/contacts
PATCH  /api/v1/accounts/{id}/contacts/{contactId}
DELETE /api/v1/accounts/{id}/contacts/{contactId}
PATCH  /api/v1/accounts/{id}/escalation      { p1_after_days, p2_after_days }
PATCH  /api/v1/accounts/{id}/settings
POST   /api/v1/accounts/{id}/pause           { reason, until? }
POST   /api/v1/accounts/{id}/resume
```

`POST /api/v1/accounts` resolves a batch of names to accounts, creating the
ones the org does not have yet, and answers with a row per requested name —
`201` when at least one account was created, `200` when every name already
matched one:

```json
{
  "accounts": [
    {
      "requested_name": "Sharma Traders Pvt Ltd",
      "account_id": "…",
      "name": "Sharma Traders",
      "created": false
    }
  ]
}
```

A name that matches an existing account is returned rather than refused — an
import naming a known customer must land on that customer. Matching is on
`app.normalize_account_name()`, so `name` is the account's own name and may
differ from what was asked for; `requested_name` is the echo that lets a caller
map the answer back. It is a batch because the importer's account column is,
and it carries no `If-Match`: creating accounts touches no existing row.

Every other mutation returns the **full updated resource**, not `204`. The frontend replaces its cached copy rather than guessing what changed, which is what keeps optimistic updates honest.

Every mutation of an existing account writes an `activity_log` row in the same transaction. An audit trail written separately is an audit trail that drifts.

### Error codes the frontend handles specifically

| Code                    | HTTP | Message                                                                      |
| ----------------------- | ---- | ---------------------------------------------------------------------------- |
| `last_p0_required`      | 409  | An account needs a P0 contact to be chased. Add a replacement first.         |
| `escalation_order`      | 422  | P2 must come after P1.                                                       |
| `pause_reason_required` | 422  | Add a reason before pausing.                                                 |
| `stale_write`           | 409  | Someone else changed this account. Reload and try again.                     |
| `channel_unreachable`   | 422  | Email needs an address to send to, and WhatsApp or SMS needs a phone number. |

`message` is user-facing copy following the voice rules and is displayed verbatim.

### Concurrency

Every mutation **of an existing account** accepts `If-Match` carrying the resource's `updated_at`. Creating accounts is the exception — `POST /api/v1/accounts` has no prior resource to be stale against, and two people adding accounts at the same time is not a conflict; the unique index on the normalized name settles the one case where they collide. A mismatch returns `stale_write`. Two people editing the same account's contact ladder is not hypothetical — collections is a shared workflow — and last-write-wins silently deletes somebody's contact.

---

## 4. Tests

```
test_chase_status_no_p0_beats_bounced
test_chase_status_bounced_p0_distinct_from_no_p0
test_chase_status_paused_until_past_is_active
test_multiple_contacts_same_tier_allowed
test_removing_last_usable_p0_rejected
test_marking_last_p0_dnc_rejected
test_tier_change_does_not_demote_others
test_escalation_p2_must_exceed_p1
test_pause_without_reason_rejected
test_avg_days_late_null_under_three_samples
test_account_aging_sums_to_outstanding
test_account_overdue_equals_outstanding_minus_not_yet_due
test_org_totals_equal_sum_of_account_outstanding
test_every_mutation_writes_activity_log
test_stale_if_match_rejected
```

The three reconciliation tests matter most. `test_org_totals_equal_sum_of_account_outstanding` is what would have caught the Dashboard fixture contradiction before it reached a screen.
