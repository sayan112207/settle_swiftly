# Chasing scheduler

How a due invoice becomes a sent reminder. Written to be built from; the
decisions below are settled unless marked otherwise.

The pieces either side of this already exist. `sendReminder` composes and
sends one message and records it in `email_sends`; `ingestEmailActivity` turns
the provider's verdict back into `contacts.delivery_state`. What is missing is
the thing in the middle that decides _who gets what, today_.

---

## 1. Three sources disagree about recipients. Escalation days win.

Today the codebase answers "who receives step 3" three different ways:

| Source                                     | Says                       | Introduced                    |
| ------------------------------------------ | -------------------------- | ----------------------------- |
| `schedule_reminder()` — `v_ceiling`        | step 2 → P1, step 3+ → P2  | `20260816120500_reminders`    |
| `DEFAULT_CADENCE[n].recipients`            | s3 → `p0p1`                | `accounts-rules.ts`           |
| `accounts.p1_after_days` / `p2_after_days` | P1 at day 21, P2 at day 45 | `20260920120000_accounts_api` |

**The rule: effective recipients are the step's `recipients` intersected with
the tiers whose escalation day has passed. P0 is always included.**

```
effective = { P0 }
          ∪ ({ P1 } if step.recipients includes p1 and daysOverdue >= p1_after_days)
          ∪ ({ P2 } if step.recipients includes p2 and daysOverdue >= p2_after_days)
```

Escalation days win because they are the only one of the three the product
states in words. `escalationContacts()` and the Contacts tab's live preview
render "Rajesh joins at day 21" to the user's face. Anything that overrode
that would make a sentence on screen false, and that sentence is the only
place a user can see what is going to happen.

They are also the setting users deliberately edit, with a check constraint
(`p2_after_days > p1_after_days`), a dedicated error code (`escalation_order`)
and their own RPC. The product already treats them as authoritative.

`schedule_reminder()`'s ladder is not a competing decision — it predates both
other mechanisms by a month, from when step number was the only signal that
existed. **It must be replaced, not reconciled.**

The step's `recipients` survives as a ceiling, and that is a real control:
setting s6 to `p0p1` means "on this account, never escalate to the director,
however old this gets". It composes with the timing instead of fighting it.

With the shipped defaults this yields:

| Step              | Cadence says | Escalation allows | Sends to     |
| ----------------- | ------------ | ----------------- | ------------ |
| s1 (−3), s2 (due) | `p0`         | —                 | P0           |
| s3 (+7), s4 (+14) | `p0p1`       | day < 21          | P0           |
| s5 (+30)          | `p0p1p2`     | 30 ≥ 21, < 45     | P0 + P1      |
| s6 (+45)          | `p0p1p2`     | 45 ≥ 45           | P0 + P1 + P2 |

**The cadence editor must show effective recipients for that account**, or say
"P1 joins at day 21" inline. Showing `P0 + P1` on s3 while P1 receives nothing
moves the lie rather than removing it.

---

## 2. `schedule_reminder()` would mail a do-not-contact contact

```sql
where c.account_id = v_account and c.is_active and c.priority <= v_ceiling
```

No `do_not_contact` filter. Every rule in `accounts-rules.ts` excludes those
contacts — `usableP0s`, `resolveChaseStatus`, `contactPip`,
`escalationContacts` — but this RPC does not, so somebody who explicitly asked
not to be chased would be chased. Fix it in the same migration that replaces
the ceiling.

A bounced contact is a separate question and the answer is different: leave
them in the fan-out. `delivery_state` describes an address that is failing,
not a person who declined, and the account-level `bounced_p0` gate already
stops the whole ladder when the only usable P0 is bouncing.

---

## 3. Invoices that arrive already overdue

A Tally or Zoho export is historical by definition, so most first imports
contain invoices that are already weeks past due. Starting their ladder at s1
would send four reminders at once; starting silently at the nearest step takes
a decision the user should make.

**Ask once per import, not once per invoice.** Two hundred invoices with
eighty overdue is eighty modals, which is unusable, and the repo already
requires bulk actions to state their count.

```
47 of these invoices are already overdue.
  ( ) Start at the step matching their age        ← default
  ( ) Start from the beginning of the cadence
  ( ) Start chasing on a date I pick
  ( ) Don't chase these — I'll turn them on individually
```

### `invoices.chase_start_on date null`

The answer has to persist or the scheduler re-derives it on every run and the
choice evaporates.

- `null` — derive from `due_date` as normal. The default for everything
  created in the product.
- a date — the ladder's day zero is this instead of `due_date`. "Start at the
  step matching their age" writes `due_date`; "start from the beginning"
  writes today; "a date I pick" writes that date.
- "Don't chase" is **not** a far-future date. Use the existing account-level
  stop, or an explicit per-invoice flag — a sentinel date that silently
  becomes live when it arrives is the kind of thing nobody remembers setting.

Re-import must not clobber a set value. The importer upserts on
`(org_id, account_id, invoice_number_normalized)`; `chase_start_on` is a user
decision, not imported data, and stays untouched.

---

## 4. Which step is due today

`CadenceStep.label` is currently display-only: `−3 days`, `Due date`, `+7`,
`+14`, `+30`, `+45`. Something has to turn those into offsets.

**Put the offset in the step, not in a parser.** Add `offset_days: number` to
`CadenceStep` (−3, 0, 7, 14, 30, 45) and keep `label` for rendering. A regex
over a label containing a Unicode minus sign is a bug waiting to happen, and
the label is copy — someone will reword it.

A step is due when:

```
daysSinceAnchor >= step.offset_days
```

where `daysSinceAnchor = daysBetween(chase_start_on ?? due_date, today)`.

**Fire the latest due step that has not been sent, never the backlog.** An
invoice first seen at +20 sends s4 and nothing else; s1–s3 are skipped, not
queued. Nobody wants four emails at once, and `reminders_invoice_step_uniq`
means a skipped step can never arrive later.

---

## 5. Gates, in order

Account level first — while an account cannot be chased at all, that is the
answer for every invoice on it. `resolveChaseStatus()` already decides this
and must not be reimplemented:

1. `no_p0` — no usable P0
2. `bounced_p0` — every usable P0 is bouncing
3. `paused` — `chase_mode = 'stopped'`, or `paused_at` set and `paused_until`
   null or not yet past

Then per invoice, which `ineligibleReason()` already decides:

4. `Disputed`
5. `Promise pending` — an active promise pause
6. `Not yet due` — relative to the **anchor**, not `due_date`

Then the send window: `send_window_mode`, `send_window_opens` / `_closes` /
`_days`, in the org's timezone. Outside it, do nothing and leave the step
unsent — it is still due on the next run inside the window.

**Reuse these functions. Do not restate any of them in SQL.** The same
reasoning that keeps `resolveDeliveryVerdict` out of PL/pgSQL applies here.

---

## 6. Idempotency

```sql
create unique index reminders_invoice_step_uniq on public.reminders (invoice_id, step);
```

One row per invoice per step, enforced by the database. "Has step 4 already
gone out?" is not a question the scheduler has to get right in application
code — a second attempt is a unique violation, not a second email.

This is what makes the scheduler safe to run on a heartbeat, and safe to
recover: miss six hours to an outage and the next run sends what is due
without resending what went.

Insert the `reminders` row **before** calling `sendReminder`, for the reason
`email_sends` is written before its send: a message the database never heard
of gets sent again.

---

## 7. Quota

The provider account allows 1,000 emails a month. A fully-escalated invoice
costs 12 (2 steps × P0, 2 × P0+P1, 2 × P0+P1+P2), so roughly 80 invoices a
month before sends start failing silently mid-ladder.

Check `cycle_remaining` from `/stats/email_summary` before a batch and stop
early with a recorded reason. The API key already has that permission. Running
out mid-ladder is worse than not starting: the customer gets half a
conversation.

---

## 8. What the cron does

Nothing but wake things up. See `docs/accounts-contract.md` for why the work
stays in TypeScript.

| Job                    | Cadence      | Endpoint                           |
| ---------------------- | ------------ | ---------------------------------- |
| Ingest delivery events | every 15 min | `POST /api/v1/internal/email/poll` |
| Send due reminders     | hourly       | `POST /api/v1/internal/chase/run`  |

Hourly rather than daily because the send window is per-account and in the
org's timezone — encoding office hours as a UTC cron expression is wrong for
the first customer in a second timezone. Let each account's window decide and
keep cron ignorant of time zones.

Both endpoints are the first in this codebase without a session. They need a
shared secret compared in constant time, held in `supabase_vault` and never in
a migration.

**Ship the send job disabled.** The ingest job is read-mostly and safe to
enable immediately. A misconfigured cron that mails customers on a loop is the
one failure here that cannot be rolled back, so the first run should be manual
and watched.

---

## 9. Not settled

- **Weekend and holiday handling.** `send_window_days` covers weekends. Indian
  public holidays are not modelled at all, and a firm reminder landing on
  Diwali is a bad look.
- **Per-invoice "don't chase".** §3 rejects the sentinel date but does not
  choose the replacement.
- **Voice.** `allowed_channels` permits `voice` on s5 and s6 and nothing can
  place a call. Steps configured for voice must be skipped with a recorded
  reason, not silently treated as email.
