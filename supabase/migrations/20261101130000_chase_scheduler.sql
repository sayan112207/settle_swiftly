-- The chasing scheduler's state: claims, cancellation reasons, and alerts.
--
-- See docs/chasing-scheduler-spec.md §6 (claims), §8 (the daily schedule) and
-- §9 (retries and alerts). The decisions stay in TypeScript; what lives here
-- is what has to be atomic or enforced.
--
-- Grants are explicit throughout. New objects are no longer exposed to the
-- API roles by default (supabase/config.toml, `auto_expose_new_tables`), so a
-- table or function that `service_role` is meant to reach has to say so.

-- ---------------------------------------------------------------------------
-- reminders: the claim lease, and why a row was cancelled
-- ---------------------------------------------------------------------------

alter table public.reminders
  -- §6: taken with a conditional update before a send, released by settle.
  -- Expires after 15 minutes, so a run that dies mid-send leaves a row that
  -- the next run can recover rather than one that is stuck for ever.
  add column claimed_at    timestamptz,
  -- Why a row is `cancelled`: out of retries, a hold, or a user. A cancelled
  -- row counts toward the watermark (§4), so the ladder moves past it, and
  -- this is the only record of why it did.
  add column cancel_reason text,
  add constraint reminders_cancel_has_reason check (
    status <> 'cancelled' or btrim(coalesce(cancel_reason, '')) <> ''
  );

-- The sender's read: today's queue, per day.
create index reminders_open_day_idx on public.reminders (scheduled_for)
  where status in ('scheduled', 'failed');

-- ---------------------------------------------------------------------------
-- chase_alerts: what the user has to act on
--
-- Two kinds, both about an address:
--   address_bounced — a hard bounce. The address does not exist. Raised by
--                     the ingester the moment it stores the event.
--   undelivered     — a recipient still failing after the retry week. Raised
--                     by the planner when it gives up.
--
-- One open alert per contact per kind. Three invoices bouncing off the same
-- dead address are one problem with one fix, not three rows to dismiss.
-- ---------------------------------------------------------------------------

create table public.chase_alerts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  account_id   uuid not null,
  -- `set null` on all three: the alert outlives what it was about, and
  -- `to_email` keeps the address regardless.
  contact_id   uuid references public.contacts (id) on delete set null,
  reminder_id  uuid references public.reminders (id) on delete set null,
  invoice_id   uuid,
  kind         text not null check (kind in ('address_bounced', 'undelivered')),
  to_email     text,
  -- The provider's words where there are any. Rendered to the user, so the
  -- writer composes it, never a stack trace.
  reason       text not null check (btrim(reason) <> ''),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null,
  resolution   text check (resolution in ('contact_changed', 'dismissed')),
  constraint chase_alerts_account_fk foreign key (account_id, org_id)
    references public.accounts (id, org_id) on delete cascade,
  constraint chase_alerts_resolution_pair check ((resolved_at is null) = (resolution is null))
);

create unique index chase_alerts_open_uniq
  on public.chase_alerts (contact_id, kind) where resolved_at is null;
create index chase_alerts_org_open_idx
  on public.chase_alerts (org_id, created_at desc) where resolved_at is null;

alter table public.chase_alerts enable row level security;

create policy chase_alerts_select_member on public.chase_alerts
  for select to authenticated
  using (app.is_org_member(org_id));

-- Read-only to members; written by the RPCs below and the trigger.
revoke all on public.chase_alerts from anon, authenticated;
grant select on public.chase_alerts to authenticated;
grant select on public.chase_alerts to service_role;

create trigger chase_alerts_audit
  after insert or update or delete on public.chase_alerts
  for each row execute function app.tg_audit();

-- ---------------------------------------------------------------------------
-- Fixing the contact resolves its alerts.
--
-- Changing the email is the fix for a dead address, and retiring the contact
-- or marking it do-not-contact means nobody will mail it again — either way
-- the alert has nothing left to ask. BEFORE DELETE, because by AFTER the
-- foreign key has already nulled `contact_id` and the alert can no longer be
-- found by it.
-- ---------------------------------------------------------------------------

create or replace function app.tg_resolve_contact_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     or old.email is distinct from new.email
     or (old.is_active and not new.is_active)
     or (not old.do_not_contact and new.do_not_contact) then
    update public.chase_alerts a
       set resolved_at = now(),
           resolved_by = auth.uid(),
           resolution  = 'contact_changed'
     where a.contact_id = old.id
       and a.resolved_at is null;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger contacts_resolve_alerts_on_change
  after update on public.contacts
  for each row execute function app.tg_resolve_contact_alerts();

create trigger contacts_resolve_alerts_on_delete
  before delete on public.contacts
  for each row execute function app.tg_resolve_contact_alerts();

-- ---------------------------------------------------------------------------
-- chase_alert_raise: an alert and its activity row, together
--
-- Returns whether a new alert was raised. False means one is already open for
-- this contact and kind — the caller has nothing more to do.
-- ---------------------------------------------------------------------------

create or replace function public.chase_alert_raise(
  p_contact  uuid,
  p_kind     text,
  p_reason   text,
  p_reminder uuid default null,
  p_to_email text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.contacts;
  v_account public.accounts;
  v_invoice uuid;
  v_number  text;
  v_id      uuid;
begin
  select * into v_contact from public.contacts c where c.id = p_contact;
  if v_contact.id is null then
    raise exception 'contact_not_found' using errcode = 'P0001';
  end if;
  select * into v_account from public.accounts a where a.id = v_contact.account_id;

  if p_reminder is not null then
    select r.invoice_id, i.invoice_number into v_invoice, v_number
      from public.reminders r
      join public.invoices i on i.id = r.invoice_id
     where r.id = p_reminder;
  end if;

  insert into public.chase_alerts (
    org_id, account_id, contact_id, reminder_id, invoice_id, kind, to_email, reason
  )
  values (
    v_contact.org_id, v_contact.account_id, v_contact.id, p_reminder, v_invoice, p_kind,
    coalesce(p_to_email, v_contact.email), p_reason
  )
  on conflict (contact_id, kind) where resolved_at is null do nothing
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  -- Written directly rather than through app.log_activity, which has no
  -- invoice_id parameter. `bounce` covers both kinds: each is an address that
  -- mail is not reaching, and the title says which.
  insert into public.activity_log (
    org_id, account_id, actor_user_id, kind, title, detail, tone,
    link_label, link_href, invoice_id, contact_id
  )
  values (
    v_account.org_id, v_account.id, null, 'bounce',
    case p_kind
      when 'address_bounced' then format('%s''s email address doesn''t exist', v_contact.name)
      else format('Reminder to %s not delivered after 7 days', v_contact.name)
    end,
    concat_ws(' · ', coalesce(p_to_email, v_contact.email), v_number, p_reason),
    'danger', 'Edit contact',
    format('/app/accounts/%s?tab=contacts', v_account.id),
    v_invoice, v_contact.id
  );

  return true;
end;
$$;

revoke execute on function public.chase_alert_raise(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.chase_alert_raise(uuid, text, text, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- chase_alert_dismiss: the user saw it and chose not to act
-- ---------------------------------------------------------------------------

create or replace function public.chase_alert_dismiss(p_alert uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select a.org_id into v_org from public.chase_alerts a where a.id = p_alert;
  if v_org is null or not app.is_org_member(v_org) then
    raise exception 'alert_not_found' using errcode = 'P0001';
  end if;

  update public.chase_alerts a
     set resolved_at = now(), resolved_by = auth.uid(), resolution = 'dismissed'
   where a.id = p_alert and a.resolved_at is null;
end;
$$;

revoke execute on function public.chase_alert_dismiss(uuid) from public, anon;
grant execute on function public.chase_alert_dismiss(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- chase_reminder_settle: a reminder's outcome, its claim released, and — when
-- it went out — the account's activity row, in one transaction.
--
-- `sent` names the recipients the provider actually accepted for this
-- reminder, not everyone on it: a hard-bounced P1 did not receive s5, and the
-- activity log is where the user reads who did.
-- ---------------------------------------------------------------------------

create or replace function public.chase_reminder_settle(
  p_reminder uuid,
  p_status   public.reminder_status,
  p_reason   text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminder public.reminders;
  v_invoice  public.invoices;
  v_names    text;
begin
  if p_status = 'scheduled' then
    raise exception 'settle_needs_outcome' using errcode = 'P0001';
  end if;

  update public.reminders r
     set status        = p_status,
         sent_at       = case when p_status = 'sent' then now() else r.sent_at end,
         cancel_reason = case when p_status = 'cancelled' then p_reason else null end,
         claimed_at    = null
   where r.id = p_reminder
  returning * into v_reminder;

  if v_reminder.id is null then
    raise exception 'reminder_not_found' using errcode = 'P0001';
  end if;

  if p_status <> 'sent' then
    return;
  end if;

  select * into v_invoice from public.invoices i where i.id = v_reminder.invoice_id;

  select string_agg(distinct c.name, ', ') into v_names
    from public.email_sends s
    join public.contacts c on c.id = s.contact_id
   where s.reminder_id = v_reminder.id and s.status = 'sent';

  insert into public.activity_log (
    org_id, account_id, actor_user_id, kind, title, detail, tone,
    link_label, link_href, invoice_id
  )
  values (
    v_invoice.org_id, v_invoice.account_id, null, 'message_sent',
    format('Reminder sent for %s', v_invoice.invoice_number),
    concat_ws(' · ', format('Step %s', v_reminder.step), initcap(v_reminder.tone::text),
              case when v_names is not null then 'to ' || v_names end),
    'neutral', 'Open invoices',
    format('/app/accounts/%s?tab=invoices', v_invoice.account_id),
    v_invoice.id
  );
end;
$$;

revoke execute on function public.chase_reminder_settle(uuid, public.reminder_status, text)
  from public, anon, authenticated;
grant execute on function public.chase_reminder_settle(uuid, public.reminder_status, text)
  to service_role;

-- `schedule_reminder` predates the explicit-grant default, and the planner is
-- now its only caller.
grant execute on function public.schedule_reminder(
  uuid, smallint, public.contact_channel, public.reminder_tone, text, date
) to service_role;

-- ---------------------------------------------------------------------------
-- chase_reminder_cancel: the user stops one of today's reminders from the
-- Outbox (spec §10), until the sender claims it.
--
-- A claimed reminder is mid-send and cannot be taken back, so the claim is
-- the line: the update matches only an unclaimed row (or one whose lease has
-- lapsed), and the sender's own claim matches only a reminder still open. One
-- of the two wins; neither half-wins. A cancelled step joins the watermark,
-- so the planner never brings it back.
-- ---------------------------------------------------------------------------

create or replace function public.chase_reminder_cancel(p_reminder uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select r.org_id into v_org from public.reminders r where r.id = p_reminder;
  if v_org is null or not app.is_org_member(v_org) then
    raise exception 'reminder_not_found' using errcode = 'P0001';
  end if;

  update public.reminders r
     set status = 'cancelled', cancel_reason = 'Cancelled from the Outbox', claimed_at = null
   where r.id = p_reminder
     and r.status in ('scheduled', 'failed')
     and (r.claimed_at is null or r.claimed_at < now() - interval '15 minutes');

  return found;
end;
$$;

revoke execute on function public.chase_reminder_cancel(uuid) from public, anon;
grant execute on function public.chase_reminder_cancel(uuid) to authenticated;
