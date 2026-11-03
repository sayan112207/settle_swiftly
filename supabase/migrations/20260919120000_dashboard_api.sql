-- Dashboard API: the columns the chase queue and summary read, and the
-- append-only table `POST /api/v1/chases` writes to.
--
-- docs/api-contract.md describes a greenfield schema (status values 'Disputed'
-- and 'Promised', stored priority columns, reminder counters). This migration
-- maps it onto the schema that already exists instead of duplicating it:
--
--   contract                         here
--   status = 'Disputed'              invoices.disputed_at is not null
--   status = 'Promised'              invoices.promised_date is not null
--   status = 'Partially paid'        payments exist and a balance remains
--   amount_paid                      sum(payments.amount)  (already derived)
--   reminder_count / last_reminder   reminders with status 'sent'
--   priority_score / band / reason   computed per request, not stored
--
-- Priority is computed on read because it is relative to the org's whole
-- eligible set (p95 normalisation): storing it means a stale score the moment
-- any other invoice changes, and there is no scheduler to refresh it.

-- ---------------------------------------------------------------------------
-- Org timezone. days_overdue is measured against today's date in this zone;
-- due dates themselves stay plain `date` with no conversion.
-- ---------------------------------------------------------------------------
alter table public.orgs
  add column timezone text not null default 'Asia/Kolkata'
    check (btrim(timezone) <> '');

-- ---------------------------------------------------------------------------
-- Disputes and promises on invoices.
--
-- promised_date: the day the customer said they would pay.
-- promised_at:   the day that promise was recorded. The chase pause is capped
--                at 45 days from here, so a far-future promise cannot stall
--                chasing indefinitely.
-- A newer promise overwrites both; promise_broken_count keeps accumulating.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column disputed_at            timestamptz,
  add column promised_date          date,
  add column promised_at            date,
  add column promise_broken_count   int not null default 0
    check (promise_broken_count >= 0),
  add column last_promise_broken_at date,
  add constraint invoices_promise_pair check (
    (promised_date is null) = (promised_at is null)
  );

-- ---------------------------------------------------------------------------
-- Contact deliverability. 'bounced' is set by the mail provider, never by a
-- user edit; a P0 that bounces can no longer carry a chase.
-- ---------------------------------------------------------------------------
create type public.delivery_state as enum ('verified', 'unverified', 'bounced');

alter table public.contacts
  add column delivery_state public.delivery_state not null default 'unverified';

-- ---------------------------------------------------------------------------
-- Account pause. Paused while paused_at is set and paused_until is null or not
-- yet past. Pausing stops chasing; it does not remove anything from aging.
-- ---------------------------------------------------------------------------
alter table public.accounts
  add column paused_at    timestamptz,
  add column paused_until date,
  add column pause_reason text,
  add constraint accounts_pause_reason_required check (
    paused_at is null or btrim(coalesce(pause_reason, '')) <> ''
  );

-- ---------------------------------------------------------------------------
-- chase_requests: one row per invoice accepted by POST /api/v1/chases.
-- Append-only. Sending the reminder itself is a later milestone.
-- ---------------------------------------------------------------------------
create table public.chase_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs (id) on delete cascade,
  invoice_id   uuid not null,
  requested_by uuid not null references auth.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  constraint chase_requests_invoice_fk foreign key (invoice_id, org_id)
    references public.invoices (id, org_id) on delete cascade
);

create index chase_requests_org_time_idx on public.chase_requests (org_id, requested_at desc);
create index chase_requests_invoice_time_idx on public.chase_requests (invoice_id, requested_at desc);

alter table public.chase_requests enable row level security;

create policy chase_requests_select_member on public.chase_requests
  for select to authenticated
  using (app.is_org_member(org_id));

-- A member may only record requests as themselves.
create policy chase_requests_insert_member on public.chase_requests
  for insert to authenticated
  with check (app.is_org_member(org_id) and requested_by = auth.uid());

-- No update or delete policy, and the grants are revoked too: append-only.
revoke update, delete on public.chase_requests from anon, authenticated;

create trigger chase_requests_audit
  after insert or update or delete on public.chase_requests
  for each row execute function app.tg_audit();

-- ---------------------------------------------------------------------------
-- Broken promises.
--
-- A promise is broken on the first day its pause is no longer active while the
-- invoice is still unpaid. That day is fixed by the promise itself:
--
--   pause_end  = least(promised_date, promised_at + 45)
--   broken_on  = pause_end + 1
--
-- so this can run any number of times, on any day, and records each promise at
-- most once: it only fires while last_promise_broken_at is behind broken_on.
-- A promise dated before it was recorded never paused anything, so it is not
-- counted as broken.
--
-- security invoker: runs under the caller's RLS, touching only invoices they
-- could update anyway.
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_broken_promises(p_org uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date;
  v_count int;
begin
  select (now() at time zone o.timezone)::date into v_today
  from public.orgs o
  where o.id = p_org;

  if v_today is null then
    return 0;
  end if;

  with candidates as (
    select
      i.id,
      least(i.promised_date, i.promised_at + 45) + 1 as broken_on
    from public.invoices i
    where i.org_id = p_org
      and i.promised_date is not null
      and i.status not in ('draft', 'void', 'paid', 'written_off')
      and i.promised_date >= i.promised_at
      and i.amount > coalesce(
        (select sum(p.amount) from public.payments p where p.invoice_id = i.id), 0
      )
  )
  update public.invoices i
  set promise_broken_count   = i.promise_broken_count + 1,
      last_promise_broken_at = c.broken_on
  from candidates c
  where i.id = c.id
    and c.broken_on <= v_today
    and (i.last_promise_broken_at is null or i.last_promise_broken_at < c.broken_on);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.reconcile_broken_promises(uuid) from public, anon;
grant execute on function public.reconcile_broken_promises(uuid) to authenticated;
