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
- a date — the ladder's **day zero**, standing in for `due_date`. Day zero is
  not the day the first reminder goes out: s1 sits at −3, so the ladder starts
  three days earlier.

  | Choice                               | `chase_start_on`                         |
  | ------------------------------------ | ---------------------------------------- |
  | Start at the step matching their age | `due_date` (i.e. leave it null)          |
  | Start from the beginning             | **today − s1.offset_days**, so today + 3 |
  | Start on a date I pick               | that date + 3, same reasoning            |

  Writing plain `today` would make `daysSinceAnchor` zero, whose latest due
  step is s2 — so "start from the beginning" would skip the beginning. Any
  UI offering a start date must apply the same shift, or state that it means
  day zero rather than first contact.

- "Don't chase" is a **per-invoice flag**, `invoices.chase_stopped_at
timestamptz null`. Not a far-future date: a sentinel that silently goes live
  when it arrives is the kind of thing nobody remembers setting. Not the
  account-level stop either — that would also silence invoices outside the
  import the user was answering about, which is not what they were asked.
  The scheduler skips any invoice with it set, and clearing it resumes the
  ladder wherever the anchor now places it.

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

Selection runs in two phases, and **an outstanding step always beats a new
one**:

```
1. retry   = the lowest-numbered reminder row for this invoice whose
             status is 'scheduled' or 'failed' and whose attempts are
             under the cap.           → re-attempt that step, stop here.

2. advance = steps where offset_days <= daysSinceAnchor
                   and step_number > watermark
             fire the highest-numbered, or nothing.

   watermark = max step for this invoice whose status is 'sent'
               or 'cancelled' — steps that are finished, either way.
```

**Phase 1 before phase 2**, or §6's promise that "a retry re-attempts one step,
it does not move to the next" is not kept: a failed s4 would be passed over
and s5 sent in its place, escalating on the strength of a message the customer
never received.

**The watermark counts `cancelled`, not just `sent`.** Otherwise a step that
exhausts its retries freezes the invoice for ever — phase 1 keeps selecting
it, phase 2 never runs, and the ladder stops silently. When the retry week
runs out (§9) the row is marked `cancelled` with the reason recorded, and the
ladder continues at the next step. One undeliverable message must not end the
relationship; if the address itself is the problem, the bounce path already
moves `contacts.delivery_state` and the account-level gate takes over.

**Attempts are counted, not stored**: `email_sends` carries `reminder_id`, so
the number of attempts is the number of rows pointing at that reminder. No
counter column, and no counter to get out of step with reality.

The `> watermark` clause in phase 2 is load-bearing and easy to leave out.
Without it, an invoice first seen at +20 sends s4 on the first run — then on
the next run s4 is finished but s3 is still due and unsent, so "latest due
unsent" selects s3, then s2, then s1. The backlog arrives anyway, in reverse,
one per hour. Skipped steps must be skipped _permanently_, which means
comparing against the high-water mark rather than against what is missing.

Nobody wants four emails at once, which is why the backlog is dropped rather
than queued.

---

## 5. Gates, in order

Account level first — while an account cannot be chased at all, that is the
answer for every invoice on it. `resolveChaseStatus()` already decides this
and must not be reimplemented:

1. `no_p0` — no usable P0
2. `bounced_p0` — every usable P0 is bouncing
3. `paused` — `chase_mode = 'stopped'`, or `paused_at` set and `paused_until`
   null or not yet past

Then per invoice:

4. `Disputed`
5. `Promise pending` — an active promise pause
6. **Has any step come due?** — §4, not an overdue check

**Do not reuse `ineligibleReason()` wholesale here.** It folds in
`Not yet due` when `daysOverdue <= 0`, which is right for the dashboard's
chase queue — you only chase overdue invoices there — and wrong for a cadence
whose first step is at **−3**. Applied as-is it would reject every invoice
until the day after it falls due, so s1 could never send and s2 only by
accident. Take its `Disputed` and `Promise pending` clauses; let step
selection answer the timing.

Then the send window: `send_window_mode`, `send_window_opens` / `_closes` /
`_days`, in IST (§8). The planner checks the day — on a day outside the
window nothing is planned, and the step is still due on the next window day.
The sender checks the hour — a planned row waits until its account's window
is open.

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

That makes the unique index necessary but not sufficient. Row existence means
"this step was attempted", not "this step was delivered" — so retry keys on
`reminders.status`, which already has the vocabulary:

| `status`    | Meaning                             | Scheduler                   |
| ----------- | ----------------------------------- | --------------------------- |
| `scheduled` | row written, not yet sent           | claimable                   |
| `sent`      | provider accepted it; `sent_at` set | done                        |
| `failed`    | a recipient's send did not land     | claimable, for a week (§9)  |
| `cancelled` | abandoned, or out of retries        | never again; counts as done |

Without this a send that failed after the insert would be indistinguishable
from one that succeeded, and the step would be treated as delivered for ever.

### Claiming a row before sending it

Status alone is not enough, because it does not say _whether somebody is
already working on this row_. Two overlapping runs — an hourly cron that
overran, or a manual trigger beside a scheduled one — would both see the same
`scheduled` row and both send it. The unique index cannot help: the row
already exists, and neither run is inserting.

Add `reminders.claimed_at timestamptz null` and take the row with a
conditional update, in one statement:

```sql
update public.reminders
   set claimed_at = now()
 where id = $1
   and status in ('scheduled', 'failed')
   and (claimed_at is null or claimed_at < now() - interval '15 minutes')
returning id;
```

No row back means another run holds it — skip, say nothing, carry on. The
`claimed_at` test is also the lease: a run that dies mid-send leaves a claim
that expires, so the row is recoverable rather than stuck for ever. Fifteen
minutes is far longer than any send and far shorter than the gap between
runs.

**Not a run-level advisory lock**, which is the obvious alternative and does
not work here. A scheduler run is many supabase-js calls, and PostgREST gives
each one its own transaction on a pooled connection — so
`pg_try_advisory_xact_lock` releases at the end of the first call, and a
session-scoped lock ends up held by whichever pooled connection happens to
serve the next request. A per-row claim needs no session affinity, and it lets
runs overlap safely instead of merely preventing them.

Reclaiming an expired lease inherits the ambiguity from the thrown-send case
below: the previous attempt may have reached the provider.

The uncertain case carries through from `sendReminder`: a send that **threw**
is recorded as failed but worded as unknown, because a timeout can land after
the provider accepted. Retrying it blind may send a second copy, so §9 checks
for a delivery event before retrying it. And a retry never advances the
ladder — it re-attempts one step, it does not move to the next.

---

## 7. Quota

The provider account allows 1,000 emails a month, shared with the
verification mail Supabase Auth sends through the same account.

A fully-escalated invoice costs **9** emails on the default cadence and
default escalation days, assuming one contact per tier:

| Step   | Effective recipients | Emails |
| ------ | -------------------- | ------ |
| s1, s2 | P0                   | 1 each |
| s3, s4 | P0 (day < 21)        | 1 each |
| s5     | P0 + P1              | 2      |
| s6     | P0 + P1 + P2         | 3      |

That is roughly 111 invoices a month before sends start failing silently
mid-ladder.

Count the ceiling, not the cadence. The raw `recipients` on s3 and s4 say
`p0p1`, which would give 12 — but §1's escalation cap holds P1 back until day
21, and both steps fire before it. Any estimate taken from the cadence alone
is high by a quarter.

It scales with contacts per tier, not with tiers: the domain allows several
P0s — two AP staff both receiving the message — and each one is another email
on every step from s1 onward.

Check `cycle_remaining` from `/stats/email_summary` before a batch and stop
early with a recorded reason. The API key already has that permission. Running
out mid-ladder is worse than not starting: the customer gets half a
conversation.

---

## 8. The daily schedule

**Fixed to India time** (decided 1 Nov 2026). Planning runs at 08:00 IST and
sending opens at 09:00 IST. This replaces an hourly, per-timezone design:
every customer today is in India, and a schedule the user can state in one
sentence — "we plan at 8 and send at 9" — is worth more than generality
nobody needs yet. The first org outside IST reopens it (§11).

| Job                  | IST                | Cron (UTC)      | Endpoint                           | Ships |
| -------------------- | ------------------ | --------------- | ---------------------------------- | ----- |
| `email-poll`         | every 15 min       | `*/15 * * * *`  | `POST /api/v1/internal/email/poll` | on    |
| `chase-plan`         | 08:00              | `30 2 * * *`    | `POST /api/v1/internal/chase/plan` | off   |
| `chase-send`         | hourly 09:00–19:00 | `30 3-13 * * *` | `POST /api/v1/internal/chase/send` | off   |
| `cron-history-prune` | 08:47              | `17 3 * * *`    | —                                  | on    |

**Plan at 8.** For every open invoice the planner applies §5's gates and §4's
selection and writes what goes out today as `reminders` rows with
`scheduled_for = today`: new steps through `schedule_reminder()`, retries (§9)
by moving their `scheduled_for` to today. Nothing is sent. The hour between is
the user's — the Outbox (§10) shows today's queue, and anything in it can be
cancelled before it goes.

**Send from 9.** The sender takes today's `scheduled` and `failed` rows whose
account's window is open, re-checks the gates (an account paused at 8:30 must
not be mailed at 9), claims each row (§6), checks quota (§7), and sends.

**The default send window moves to 09:00–18:00**, from 10:00. Otherwise the
9 o'clock send falls outside the window the Settings tab shows the user, and
§1's argument applies: a sentence on screen would be false. Custom windows are
still honoured — which is why the sender runs hourly until 19:00 rather than
once. A 9am-only sender would never reach an account whose window opens at 11,
and 19:00 is the last hour a window closing at 20:00 (the latest Settings
offers) is open.

"Today" is the IST date everywhere: for which step is due, and for
`schedule_reminder()`'s escalation arithmetic.

Every endpoint is without a session. They take a shared secret compared in
constant time, held in `supabase_vault` and never in a migration.

**Ship the plan and send jobs disabled.** The ingest job is read-mostly and
safe to enable immediately. A misconfigured cron that mails customers on a
loop is the one failure here that cannot be rolled back, so the first run is
manual and watched.

---

## 9. Retries and alerts

What happened to each recipient of a reminder is derived from `email_sends`
and `email_callbacks` — never stored, for the reason §4 counts attempts:

| Outcome      | Evidence                                             | Then                                |
| ------------ | ---------------------------------------------------- | ----------------------------------- |
| delivered    | a `delivered` event                                  | done                                |
| accepted     | the provider took it, no event since                 | done — no news is not failure       |
| hard bounced | a hard-bounce event                                  | done; never retried; alert that day |
| retry        | refused, threw, or the latest event is a soft bounce | sent again at the next send         |
| unsent       | no attempt yet                                       | sent at the next send               |

**Per recipient, not per reminder.** When P0 got s5 and P1's mailbox was
full, only P1 gets it again. Re-sending to P0 to reach P1 is the duplicate
chase §6 exists to prevent.

**Retry for a week.** A reminder with a recipient in `retry` stays
outstanding — §4's phase 1 holds the ladder on it — and each morning the
planner moves it to today. Seven days after the reminder was first planned the
planner gives up: the row becomes `cancelled` with the provider's last reason,
an `undelivered` alert is raised for each recipient still failing, and the
ladder continues at the next step.

A soft-bounced send was `sent` as far as our handoff goes, so the planner also
reopens `sent` reminders from the last seven days whose recipients have since
soft-bounced.

**An unknown outcome is checked before it is retried.** A send that threw may
have reached the provider (§6), and with no provider id its events cannot
link to it. Before retrying, the planner looks for a `delivered` event to the
same address within 15 minutes of the attempt and, if there is one, counts the
recipient as delivered. That check is what makes a week of daily retries safe
where §6 once asked for a low cap.

**A hard bounce means the address does not exist.** It is not retried:
mailing a dead address seven times spends quota and damages the reputation of
the one sending address every customer shares. The ingester raises an
`address_bounced` alert as it stores the event, so the user hears the same
day. The alert links to the account's Contacts tab, and changing the
contact's email, retiring it, or marking it do-not-contact resolves it.

**A hold is not a failure.** If an account is paused or an invoice disputed
while a reminder is outstanding, a reminder never attempted is cancelled
quietly with the hold as its reason. One with failed attempts waits, and
alerts only if its week runs out.

Alerts live in `chase_alerts` — at most one open alert per contact per kind —
and are written to the account's activity log in the same transaction. Fixing
the contact resolves them; the user can also dismiss one.

---

## 10. The Outbox

Chasing → Outbox, as sub-tabs. The overview comes first and the detail is one
click away. Every action is a link to the screen that already does it: the
Outbox edits nothing but today's queue.

| Sub-tab            | Shows                                                                      | Actions                                  |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| Overview (default) | today's queue in one line, the week's sends and delivery rate, open alerts | links into the other three               |
| Today              | what the 8 o'clock plan queued: invoice, step, tone, recipients            | Cancel, until it sends                   |
| Sent               | recent sends, per recipient: delivered, accepted, bounced                  | → account Activity                       |
| Needs attention    | open alerts and their reasons                                              | Edit contact → account Contacts; Dismiss |

The dashboard gains one count beside its existing attention items, linking to
Needs attention. The account Activity tab records each send and each alert.

---

## 11. Not settled

- **Weekend and holiday handling.** `send_window_days` covers weekends. Indian
  public holidays are not modelled at all, and a firm reminder landing on
  Diwali is a bad look.
- **Voice and WhatsApp.** `allowed_channels` permits `voice` on s5 and s6
  and nothing can place a call or send a WhatsApp message. The planner never
  selects a step whose channel has no email in it (`whatsapp`, `voice`), and
  reports it as skipped with that reason — never silently treated as email.
- **Orgs outside India.** §8 fixes the schedule to IST.
- **Already-overdue imports (§3).** `chase_start_on` is not built yet. Until
  it is, a first import starts each invoice at the step matching its age — a
  45-day-old invoice gets a Firm s6 to the director on day one. The plan job
  ships disabled and the first plan is reviewed in the Outbox before 9, which
  is the guard until the import question exists.
