-- schedule_reminder: who actually receives a step, and when.
--
-- Three changes, all of them safe to make outright because this function has
-- no callers and `reminders` is empty. Nothing in src/ invokes it — the
-- dashboard's Chase button writes to `chase_requests` instead — so there is
-- no signature to preserve and no rows to migrate. It has been dead since the
-- foundation build.
--
-- See docs/chasing-scheduler-spec.md §1 and §2.

-- ---------------------------------------------------------------------------
-- 1. `step` is the cadence step, not a running count
--
-- It was `max(step) + 1`, which made `reminders_invoice_step_uniq` mean "this
-- invoice has had N reminders" rather than "s4 has been sent". The scheduler
-- skips the backlog — an invoice first seen at +20 fires s4 and nothing else
-- (spec §4) — so under the old numbering that reminder would have been step 1
-- and the index would not have stopped s4 going out twice.
--
-- Taking the step from the caller is what makes the unique index the
-- idempotency guarantee the scheduler relies on.
--
-- 2. Recipients come from escalation days, capped by the step
--
-- The old ladder was hardcoded: step 2 → P1, step 3+ → P2. That predated
-- `account_cadence_steps` and `p1_after_days` by a month and contradicted
-- both. Escalation days win because they are the only one of the three the
-- product states in words — the Contacts tab renders "Rajesh joins at day 21"
-- to the user's face. The step's `recipients` survives as a ceiling, so
-- "never escalate past P1 on this account" stays expressible.
--
-- 3. A do-not-contact contact is never written to
--
-- The fan-out filtered `is_active` alone, so the one person who explicitly
-- asked not to be chased was the one who would be. Every rule in
-- accounts-rules.ts excludes them; this now does too.
--
-- A *bounced* contact is deliberately still included. `delivery_state`
-- describes an address that is failing, not a person who declined, and the
-- account-level bounced_p0 gate already stops the ladder when it matters.
-- ---------------------------------------------------------------------------

drop function if exists public.schedule_reminder(
  uuid, public.contact_channel, public.reminder_tone, date
);

create or replace function public.schedule_reminder(
  p_invoice_id    uuid,
  p_step          smallint,
  p_channel       public.contact_channel,
  p_tone          public.reminder_tone,
  -- The step's ceiling, from the account's merged cadence. Text rather than an
  -- enum because that is how `account_cadence_steps.recipients` is stored.
  p_recipients    text,
  -- No default. `current_date` is the *database session's* date, which on a
  -- hosted Postgres is UTC — and the org that owns this invoice is not. For
  -- the hours when the two disagree, the escalation arithmetic below would
  -- run a day out and a reminder could gain or miss a tier at the boundary.
  -- The repo's own rule: "timezone conversion silently shifts them by a day".
  -- The caller already computes the org-local date to choose the step, so it
  -- passes that rather than letting the database guess.
  p_scheduled_for date
)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org          uuid;
  v_account      uuid;
  v_due          date;
  v_p1_after     int;
  v_p2_after     int;
  v_days         int;
  v_step_cap     public.contact_priority;
  v_time_cap     public.contact_priority;
  v_ceiling      public.contact_priority;
  v_prev_tone    public.reminder_tone;
  v_reminder     public.reminders;
  v_recipients   int;
begin
  -- `is null` first, and not folded into the NOT IN. `null not in (...)`
  -- evaluates to NULL, the IF does not fire, and the CASE below falls to its
  -- ELSE — which is P2. A missing ceiling would become the *most* permissive
  -- one, which is exactly the wrong direction for a function that decides who
  -- receives a chase.
  if p_recipients is null or p_recipients not in ('p0', 'p0p1', 'p0p1p2') then
    raise exception 'unknown_recipients' using errcode = 'P0001';
  end if;

  if p_scheduled_for is null then
    raise exception 'scheduled_for_required' using errcode = 'P0001';
  end if;

  select i.org_id, i.account_id, i.due_date, a.p1_after_days, a.p2_after_days
    into v_org, v_account, v_due, v_p1_after, v_p2_after
  from public.invoices i
  join public.accounts a on a.id = i.account_id and a.org_id = i.org_id
  where i.id = p_invoice_id;

  if v_org is null then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;

  -- No app.is_org_member() check any more. It reads auth.uid(), which is null
  -- for the background scheduler, so it would have refused the only caller
  -- this function now has. Authorisation is the grant below instead: nothing
  -- holding a browser session can reach this, which is right for a function
  -- that fans a real email out to a customer's staff.

  -- "Usable" means the same thing here as everywhere else: active, and not
  -- opted out. An account whose only P0 asked not to be contacted cannot be
  -- chased, and silently sending to P1 instead would be worse than refusing.
  if not exists (
    select 1 from public.contacts c
    where c.account_id = v_account
      and c.priority = 'P0'
      and c.is_active
      and not c.do_not_contact
  ) then
    raise exception 'last_p0_required' using errcode = 'P0001';
  end if;

  -- Tone may not de-escalate. Compared against the highest step already sent
  -- rather than the most recent row, because steps can be skipped and a later
  -- step is always the further-escalated one.
  select r.tone into v_prev_tone
  from public.reminders r
  where r.invoice_id = p_invoice_id
  order by r.step desc
  limit 1;

  -- enum declaration order is the escalation order
  if v_prev_tone is not null and p_tone < v_prev_tone then
    raise exception 'tone cannot de-escalate (% -> %)', v_prev_tone, p_tone
      using errcode = 'P0001';
  end if;

  -- Days overdue as of the day this is scheduled for, not today: a reminder
  -- queued for Friday escalates by Friday's arithmetic.
  --
  -- Anchored on due_date. When invoices.chase_start_on lands (spec §3) this
  -- becomes coalesce(i.chase_start_on, i.due_date) and nothing else changes.
  v_days := p_scheduled_for - v_due;

  v_step_cap := case p_recipients
    when 'p0'     then 'P0'
    when 'p0p1'   then 'P1'
    else               'P2'
  end::public.contact_priority;

  v_time_cap := case
    when v_days >= v_p2_after then 'P2'
    when v_days >= v_p1_after then 'P1'
    else                           'P0'
  end::public.contact_priority;

  -- The intersection, which on an ordered enum is just the lower of the two.
  v_ceiling := least(v_step_cap, v_time_cap);

  -- Unique on (invoice_id, step). A second attempt at the same cadence step is
  -- the scheduler re-running, not a second reminder, and the caller is meant
  -- to treat this as "already sent" rather than as a failure.
  begin
    insert into public.reminders (org_id, invoice_id, step, channel, tone, scheduled_for)
    values (v_org, p_invoice_id, p_step, p_channel, p_tone, p_scheduled_for)
    returning * into v_reminder;
  exception when unique_violation then
    raise exception 'step_already_scheduled' using errcode = 'P0001';
  end;

  insert into public.reminder_recipients (reminder_id, contact_id)
  select v_reminder.id, c.id
  from public.contacts c
  where c.account_id = v_account
    and c.is_active
    and not c.do_not_contact
    and c.priority <= v_ceiling;   -- cumulative: P0 <= P1 <= P2

  get diagnostics v_recipients = row_count;
  if v_recipients = 0 then
    -- Unreachable while the P0 check above holds, but a reminder addressed to
    -- nobody is the silent failure this whole ladder exists to avoid.
    raise exception 'no_reachable_recipients' using errcode = 'P0001';
  end if;

  insert into public.reminder_events (org_id, invoice_id, reminder_id, kind)
  values (v_org, p_invoice_id, v_reminder.id, 'reminder_scheduled');

  return v_reminder;
end;
$$;

-- Background only. The dashboard's Chase button queues a `chase_requests` row
-- and the scheduler decides what to do with it; nothing holding a browser
-- session should be able to fan a message out to a customer directly.
revoke execute on function public.schedule_reminder(
  uuid, smallint, public.contact_channel, public.reminder_tone, text, date
) from public, anon, authenticated;
