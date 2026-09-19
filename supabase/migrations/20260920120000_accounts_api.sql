-- Accounts API: the schema behind docs/accounts-contract.md and
-- docs/account-settings-changes.md, and one RPC per mutation.
--
-- Why RPCs: the contract requires the If-Match check, the change and its
-- activity_log row to land in one transaction. PostgREST gives each
-- supabase-js call its own transaction, so a service function chaining calls
-- could write the change and lose the log row. Each RPC is `security definer`
-- (activity_log and account_cadence_steps have no write policies at all) and
-- authorises explicitly through app.lock_account_for_write before touching
-- anything.
--
-- Errors are raised as SQLSTATE P0001 with the contract's error code as the
-- message (e.g. 'stale_write'); the service maps each code to its HTTP status
-- and user-facing copy.

-- ---------------------------------------------------------------------------
-- accounts: chasing configuration, terms, ownership, archive, escalation
-- timing, and two concurrency versions.
--
-- Two versions, not one, because the contacts ladder and the rest of the
-- account are cached separately by the frontend: a contact edit must not make
-- the header's Pause button fail with stale_write. ladder_version guards
-- contacts + escalation timing; detail_version guards everything else.
-- updated_at keeps its general meaning (any change) and is not a token.
-- ---------------------------------------------------------------------------
alter table public.accounts
  add column chase_mode         text not null default 'default'
    check (chase_mode in ('default', 'custom', 'stopped')),
  add column stop_reason        text
    check (stop_reason in ('Dispute', 'Payment plan agreed', 'Client request', 'Relationship hold', 'Other')),
  add column stop_note          text,
  add column send_window_mode   text not null default 'default'
    check (send_window_mode in ('default', 'custom')),
  add column send_window_opens  time,
  add column send_window_closes time,
  add column send_window_days   text[]
    check (send_window_days <@ array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']),
  add column terms_preset       text not null default 'net_30'
    check (terms_preset in ('net_30', 'net_45', 'custom')),
  add column term_days          int not null default 30 check (term_days > 0),
  add column is_msme            boolean not null default false,
  add column tds_section        text not null default 'None'
    check (tds_section in ('194C', '194J', '194H', '194I', 'None')),
  add column tds_rate           numeric(5, 2) check (tds_rate between 0 and 30),
  add column owner_user_id      uuid references auth.users (id) on delete set null,
  add column archived_at        timestamptz,
  add column last_synced_at     timestamptz,
  add column p1_after_days      int not null default 21 check (p1_after_days > 0),
  add column p2_after_days      int not null default 45,
  add column detail_version     timestamptz not null default now(),
  add column ladder_version     timestamptz not null default now(),
  -- Contract §1: enforced here, not only in the form — the form is not the only writer.
  add constraint accounts_escalation_order check (p2_after_days > p1_after_days),
  add constraint accounts_stop_reason_when_stopped check (
    chase_mode <> 'stopped' or stop_reason is not null
  ),
  add constraint accounts_tds_rate_needs_section check (
    tds_section <> 'None' or tds_rate is null
  ),
  add constraint accounts_send_window_order check (
    send_window_opens is null or send_window_closes is null
    or send_window_closes > send_window_opens
  ),
  -- The header pause vocabulary is a fixed list (was free text).
  add constraint accounts_pause_reason_vocabulary check (
    pause_reason is null
    or pause_reason in ('Dispute', 'Payment plan agreed', 'Client request', 'Other')
  );

create index accounts_org_active_idx on public.accounts (org_id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- contacts: the full ladder entry.
-- ---------------------------------------------------------------------------
alter table public.contacts
  add column designation       text,
  add column channel_email     boolean not null default true,
  add column channel_whatsapp  boolean not null default false,
  add column channel_sms       boolean not null default false,
  add column always_cc         boolean not null default false,
  add column do_not_contact    boolean not null default false,
  add column dnc_reason        text,
  add column language          text not null default 'en'
    check (language in ('en', 'hi', 'ta', 'te', 'mr', 'gu', 'bn', 'kn')),
  add column last_bounced_at   timestamptz,
  add column last_contacted_at timestamptz,
  add column sort_order        int not null default 0 check (sort_order >= 0),
  add constraint contacts_dnc_needs_reason check (
    not do_not_contact or btrim(coalesce(dnc_reason, '')) <> ''
  );

-- Contract §1: several contacts may share a tier — two AP staff can both get
-- the P0 message. The at-most-one-P0 index from the foundation build is wrong
-- and goes; "at least one usable P0" is enforced by the RPCs below.
drop index if exists public.contacts_one_active_p0_per_account;

create index contacts_p0_active
  on public.contacts (account_id)
  where priority = 'P0' and is_active and not do_not_contact;

-- The foundation trigger blocked removing ANY active P0 while reminders were
-- scheduled, which was only "the last one" while there could be just one.
-- With several P0s allowed it must look for another usable P0 first.
create or replace function app.tg_protect_last_p0()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.priority <> 'P0' or not old.is_active or old.do_not_contact then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.priority = 'P0' and new.is_active and not new.do_not_contact then
    return new;
  end if;

  if exists (
    select 1 from public.contacts c
    where c.account_id = old.account_id
      and c.id <> old.id
      and c.priority = 'P0' and c.is_active and not c.do_not_contact
  ) then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if exists (
    select 1
    from public.reminders r
    join public.invoices i on i.id = r.invoice_id
    where i.account_id = old.account_id
      and r.status = 'scheduled'
  ) then
    raise exception 'last_p0_required' using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- The reminder chase gate and recipient fan-out must skip do-not-contact
-- contacts, or a DNC P0 would still satisfy "has a P0" and still be emailed.
create or replace function public.schedule_reminder(
  p_invoice_id    uuid,
  p_channel       public.contact_channel,
  p_tone          public.reminder_tone,
  p_scheduled_for date default current_date
)
returns public.reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org       uuid;
  v_account   uuid;
  v_step      smallint;
  v_prev_tone public.reminder_tone;
  v_reminder  public.reminders;
  v_ceiling   public.contact_priority;
begin
  select i.org_id, i.account_id into v_org, v_account
  from public.invoices i
  where i.id = p_invoice_id;

  if v_org is null then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;

  if not app.is_org_member(v_org) then
    raise exception 'not a member of this organisation' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.contacts c
    where c.account_id = v_account and c.priority = 'P0' and c.is_active and not c.do_not_contact
  ) then
    raise exception 'account has no active P0 contact and cannot be chased'
      using errcode = 'P0001';
  end if;

  select coalesce(max(r.step), 0) + 1 into v_step
  from public.reminders r
  where r.invoice_id = p_invoice_id;

  select r.tone into v_prev_tone
  from public.reminders r
  where r.invoice_id = p_invoice_id
  order by r.step desc
  limit 1;

  if v_prev_tone is not null and p_tone < v_prev_tone then
    raise exception 'tone cannot de-escalate (% -> %)', v_prev_tone, p_tone
      using errcode = 'P0001';
  end if;

  insert into public.reminders (org_id, invoice_id, step, channel, tone, scheduled_for)
  values (v_org, p_invoice_id, v_step, p_channel, p_tone, p_scheduled_for)
  returning * into v_reminder;

  v_ceiling := case
    when v_step >= 3 then 'P2'
    when v_step = 2  then 'P1'
    else 'P0'
  end::public.contact_priority;

  insert into public.reminder_recipients (reminder_id, contact_id)
  select v_reminder.id, c.id
  from public.contacts c
  where c.account_id = v_account
    and c.is_active
    and not c.do_not_contact
    and c.priority <= v_ceiling;

  insert into public.reminder_events (org_id, invoice_id, reminder_id, kind)
  values (v_org, p_invoice_id, v_reminder.id, 'reminder_scheduled');

  return v_reminder;
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-account cadence overrides (chase_mode = 'custom'). Step keys, labels and
-- the org default live in the service; only the three editable choices are
-- stored. Voice is a late-cadence policy: allowed on s5 and s6 only.
-- ---------------------------------------------------------------------------
create table public.account_cadence_steps (
  account_id uuid not null,
  org_id     uuid not null references public.orgs (id) on delete cascade,
  step_key   text not null check (step_key in ('s1', 's2', 's3', 's4', 's5', 's6')),
  tone       text not null check (tone in ('Gentle', 'Standard', 'Firm')),
  channel    text not null check (channel in ('email', 'whatsapp', 'both', 'voice')),
  recipients text not null check (recipients in ('p0', 'p0p1', 'p0p1p2')),
  primary key (account_id, step_key),
  constraint account_cadence_steps_account_fk foreign key (account_id, org_id)
    references public.accounts (id, org_id) on delete cascade,
  constraint account_cadence_steps_voice_late_only check (
    channel <> 'voice' or step_key in ('s5', 's6')
  )
);

alter table public.account_cadence_steps enable row level security;

create policy account_cadence_steps_select_member on public.account_cadence_steps
  for select to authenticated
  using (app.is_org_member(org_id));

revoke insert, update, delete, truncate on public.account_cadence_steps from anon, authenticated;
grant select on public.account_cadence_steps to authenticated;

create trigger account_cadence_steps_audit
  after insert or update or delete on public.account_cadence_steps
  for each row execute function app.tg_audit();

-- ---------------------------------------------------------------------------
-- activity_log: the account's human-readable history. title/detail are
-- composed by the backend and rendered verbatim. Written only by the RPCs.
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  account_id    uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  kind          text not null check (kind in (
    'invoice_created', 'invoice_edited', 'import', 'payment_received', 'promise_made',
    'promise_broken', 'dispute_raised', 'contact_added', 'contact_edited', 'contact_removed',
    'escalation_changed', 'settings_changed', 'bounce', 'pause', 'resume', 'message_sent'
  )),
  title         text not null check (btrim(title) <> ''),
  detail        text not null default '',
  tone          text not null default 'neutral' check (tone in ('neutral', 'warn', 'danger')),
  link_label    text,
  link_href     text,
  invoice_id    uuid,
  contact_id    uuid,
  occurred_at   timestamptz not null default now(),
  constraint activity_log_account_fk foreign key (account_id, org_id)
    references public.accounts (id, org_id) on delete cascade
);

create index activity_log_account_time_idx on public.activity_log (account_id, occurred_at desc);

alter table public.activity_log enable row level security;

create policy activity_log_select_member on public.activity_log
  for select to authenticated
  using (app.is_org_member(org_id));

revoke insert, update, delete, truncate on public.activity_log from anon, authenticated;
grant select on public.activity_log to authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers for the mutation RPCs.
-- ---------------------------------------------------------------------------

/* Locks the account row and authorises the caller. Archived and foreign
   accounts are indistinguishable from missing ones. */
create or replace function app.lock_account_for_write(p_account uuid, p_require_admin boolean)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
begin
  select * into v from public.accounts a where a.id = p_account for update;
  if v.id is null or v.archived_at is not null or not app.is_org_member(v.org_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_require_admin
     and not app.has_org_role(v.org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

create or replace function app.log_activity(
  p_account    public.accounts,
  p_kind       text,
  p_title      text,
  p_detail     text default '',
  p_tone       text default 'neutral',
  p_link_label text default null,
  p_link_tab   text default null,
  p_contact_id uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (
    org_id, account_id, actor_user_id, kind, title, detail, tone,
    link_label, link_href, contact_id
  )
  values (
    (p_account).org_id, (p_account).id, auth.uid(), p_kind, p_title, coalesce(p_detail, ''), p_tone,
    p_link_label,
    case when p_link_tab is null then null
         else format('/app/accounts/%s?tab=%s', (p_account).id, p_link_tab) end,
    p_contact_id
  );
$$;

/* Usable P0 = tier P0, active, not do-not-contact. A bounced P0 still counts
   here: it must be replaced before it can be removed. */
create or replace function app.usable_p0_count(p_account uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.contacts c
  where c.account_id = p_account and c.priority = 'P0' and c.is_active and not c.do_not_contact;
$$;

-- ---------------------------------------------------------------------------
-- Contacts ladder mutations (guarded by ladder_version).
-- ---------------------------------------------------------------------------
create or replace function public.account_contact_create(
  p_account uuid, p_if_match timestamptz, p_body jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.accounts;
  v_tier  public.contact_priority := (p_body ->> 'tier')::public.contact_priority;
  v_name  text := btrim(p_body ->> 'name');
  v_id    uuid;
begin
  v := app.lock_account_for_write(p_account, false);
  if v.ladder_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;
  if coalesce((p_body ->> 'do_not_contact')::boolean, false)
     and btrim(coalesce(p_body ->> 'dnc_reason', '')) = '' then
    raise exception 'dnc_reason_required' using errcode = 'P0001';
  end if;

  insert into public.contacts (
    org_id, account_id, name, designation, email, phone, priority,
    channel_email, channel_whatsapp, channel_sms, always_cc,
    do_not_contact, dnc_reason, language, sort_order
  )
  values (
    v.org_id, v.id, v_name,
    nullif(btrim(p_body ->> 'designation'), ''),
    nullif(btrim(p_body ->> 'email'), ''),
    nullif(btrim(p_body ->> 'phone'), ''),
    v_tier,
    coalesce((p_body ->> 'channel_email')::boolean, true),
    coalesce((p_body ->> 'channel_whatsapp')::boolean, false),
    coalesce((p_body ->> 'channel_sms')::boolean, false),
    coalesce((p_body ->> 'always_cc')::boolean, false),
    coalesce((p_body ->> 'do_not_contact')::boolean, false),
    nullif(btrim(p_body ->> 'dnc_reason'), ''),
    coalesce(p_body ->> 'language', 'en'),
    (select count(*) from public.contacts c where c.account_id = v.id and c.priority = v_tier)
  )
  returning id into v_id;

  update public.accounts set ladder_version = now() where id = v.id;
  perform app.log_activity(
    v, 'contact_added', format('%s added as %s contact', v_name, v_tier),
    '', 'neutral', 'Open contacts', 'contacts', v_id
  );
end;
$$;

create or replace function public.account_contact_update(
  p_account uuid, p_contact uuid, p_if_match timestamptz, p_body jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v        public.accounts;
  c        public.contacts;
  v_tier   public.contact_priority;
  v_dnc    boolean;
  v_reason text;
begin
  v := app.lock_account_for_write(p_account, false);
  if v.ladder_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;

  select * into c from public.contacts
  where id = p_contact and account_id = v.id and is_active
  for update;
  if c.id is null then
    raise exception 'contact_not_found' using errcode = 'P0001';
  end if;

  v_tier := case when p_body ? 'tier'
                 then (p_body ->> 'tier')::public.contact_priority else c.priority end;
  v_dnc := case when p_body ? 'do_not_contact'
                then coalesce((p_body ->> 'do_not_contact')::boolean, false) else c.do_not_contact end;
  v_reason := case when p_body ? 'dnc_reason'
                   then nullif(btrim(p_body ->> 'dnc_reason'), '') else c.dnc_reason end;

  -- A usable P0 can be lost two ways: marked do-not-contact, or moved off P0.
  if c.priority = 'P0' and not c.do_not_contact
     and not (v_tier = 'P0' and not v_dnc)
     and app.usable_p0_count(v.id) <= 1 then
    raise exception 'last_p0_required' using errcode = 'P0001';
  end if;
  if v_dnc and v_reason is null then
    raise exception 'dnc_reason_required' using errcode = 'P0001';
  end if;

  update public.contacts set
    priority         = v_tier,
    name             = case when p_body ? 'name' then btrim(p_body ->> 'name') else name end,
    designation      = case when p_body ? 'designation'
                            then nullif(btrim(p_body ->> 'designation'), '') else designation end,
    email            = case when p_body ? 'email'
                            then nullif(btrim(p_body ->> 'email'), '') else email end,
    phone            = case when p_body ? 'phone'
                            then nullif(btrim(p_body ->> 'phone'), '') else phone end,
    channel_email    = coalesce((p_body ->> 'channel_email')::boolean, channel_email),
    channel_whatsapp = coalesce((p_body ->> 'channel_whatsapp')::boolean, channel_whatsapp),
    channel_sms      = coalesce((p_body ->> 'channel_sms')::boolean, channel_sms),
    always_cc        = coalesce((p_body ->> 'always_cc')::boolean, always_cc),
    do_not_contact   = v_dnc,
    dnc_reason       = case when v_dnc then v_reason else null end,
    language         = coalesce(p_body ->> 'language', language)
  where id = c.id;

  update public.accounts set ladder_version = now() where id = v.id;
  perform app.log_activity(
    v, 'contact_edited',
    format('%s updated', case when p_body ? 'name' then btrim(p_body ->> 'name') else c.name end),
    '', 'neutral', 'Open contacts', 'contacts', c.id
  );
end;
$$;

create or replace function public.account_contact_delete(
  p_account uuid, p_contact uuid, p_if_match timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
  c public.contacts;
begin
  v := app.lock_account_for_write(p_account, false);
  if v.ladder_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;

  select * into c from public.contacts
  where id = p_contact and account_id = v.id and is_active
  for update;
  if c.id is null then
    raise exception 'contact_not_found' using errcode = 'P0001';
  end if;

  if c.priority = 'P0' and not c.do_not_contact and app.usable_p0_count(v.id) <= 1 then
    raise exception 'last_p0_required' using errcode = 'P0001';
  end if;

  delete from public.contacts where id = c.id;

  update public.accounts set ladder_version = now() where id = v.id;
  perform app.log_activity(v, 'contact_removed', format('%s removed', c.name), '', 'neutral');
end;
$$;

create or replace function public.account_update_escalation(
  p_account uuid, p_if_match timestamptz, p_p1_after_days int, p_p2_after_days int
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
begin
  v := app.lock_account_for_write(p_account, false);
  if v.ladder_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;
  if p_p1_after_days is null or p_p2_after_days is null or p_p1_after_days <= 0
     or p_p2_after_days <= p_p1_after_days then
    raise exception 'escalation_order' using errcode = 'P0001';
  end if;

  update public.accounts
  set p1_after_days = p_p1_after_days,
      p2_after_days = p_p2_after_days,
      ladder_version = now()
  where id = v.id;

  perform app.log_activity(
    v, 'escalation_changed', 'Escalation timing changed',
    format('P1 joins after %s days, P2 after %s days.', p_p1_after_days, p_p2_after_days),
    'neutral', 'Open contacts', 'contacts'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Account mutations (guarded by detail_version).
-- ---------------------------------------------------------------------------

/* The settings body is validated by the service (shape, enums, voice policy)
   before it gets here; the table constraints are the backstop. */
create or replace function public.account_update_chasing_settings(
  p_account uuid, p_if_match timestamptz, p_body jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.accounts;
  v_mode  text := p_body ->> 'chase_mode';
  v_owner uuid := nullif(p_body ->> 'owner_user_id', '')::uuid;
  v_step  jsonb;
begin
  v := app.lock_account_for_write(p_account, true);
  if v.detail_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;
  if v_mode = 'stopped' and btrim(coalesce(p_body ->> 'stop_reason', '')) = '' then
    raise exception 'stop_reason_required' using errcode = 'P0001';
  end if;
  if v_owner is not null and not exists (
    select 1 from public.org_members m where m.org_id = v.org_id and m.user_id = v_owner
  ) then
    raise exception 'owner_not_member' using errcode = 'P0001';
  end if;

  update public.accounts set
    chase_mode         = v_mode,
    stop_reason        = case when v_mode = 'stopped' then p_body ->> 'stop_reason' end,
    stop_note          = case when v_mode = 'stopped'
                              then nullif(btrim(p_body ->> 'stop_note'), '') end,
    send_window_mode   = p_body ->> 'send_window_mode',
    send_window_opens  = case when p_body -> 'send_window' is not null
                              then (p_body #>> '{send_window,opens_at}')::time
                              else send_window_opens end,
    send_window_closes = case when p_body -> 'send_window' is not null
                              then (p_body #>> '{send_window,closes_at}')::time
                              else send_window_closes end,
    send_window_days   = case when p_body -> 'send_window' is not null
                              then array(select jsonb_array_elements_text(p_body #> '{send_window,days}'))
                              else send_window_days end,
    terms_preset       = p_body ->> 'terms_preset',
    term_days          = (p_body ->> 'term_days')::int,
    is_msme            = (p_body ->> 'is_msme')::boolean,
    tds_section        = p_body ->> 'tds_section',
    tds_rate           = case when p_body ->> 'tds_section' = 'None' then null
                              else (p_body ->> 'tds_rate')::numeric end,
    owner_user_id      = v_owner,
    notes              = nullif(btrim(p_body ->> 'notes'), ''),
    detail_version     = now()
  where id = v.id;

  if jsonb_typeof(p_body -> 'steps') = 'array' then
    for v_step in select * from jsonb_array_elements(p_body -> 'steps') loop
      insert into public.account_cadence_steps (account_id, org_id, step_key, tone, channel, recipients)
      values (v.id, v.org_id, v_step ->> 'key', v_step ->> 'tone', v_step ->> 'channel', v_step ->> 'recipients')
      on conflict (account_id, step_key) do update
        set tone = excluded.tone, channel = excluded.channel, recipients = excluded.recipients;
    end loop;
  end if;

  perform app.log_activity(
    v, 'settings_changed',
    case v_mode
      when 'stopped' then format('Chasing stopped — %s', p_body ->> 'stop_reason')
      when 'custom' then 'Custom chasing cadence saved'
      else 'Chasing settings updated'
    end,
    '', case when v_mode = 'stopped' then 'warn' else 'neutral' end,
    'Open settings', 'settings'
  );
end;
$$;

create or replace function public.account_archive(
  p_account uuid, p_if_match timestamptz, p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
begin
  v := app.lock_account_for_write(p_account, true);
  if v.detail_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;
  -- The client-side match is a speed bump; this is the guard.
  if upper(btrim(coalesce(p_confirm_name, ''))) <> upper(btrim(v.name)) then
    raise exception 'archive_name_mismatch' using errcode = 'P0001';
  end if;

  update public.accounts set archived_at = now(), detail_version = now() where id = v.id;
  perform app.log_activity(v, 'settings_changed', 'Account archived', '', 'warn');
end;
$$;

create or replace function public.account_pause(
  p_account uuid, p_if_match timestamptz, p_reason text, p_until date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.accounts;
  v_today date;
begin
  v := app.lock_account_for_write(p_account, false);
  if v.detail_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;
  if p_reason is null
     or p_reason not in ('Dispute', 'Payment plan agreed', 'Client request', 'Other') then
    raise exception 'pause_reason_required' using errcode = 'P0001';
  end if;

  -- paused_until is an org-local calendar date, so "the past" is too.
  select (now() at time zone o.timezone)::date into v_today from public.orgs o where o.id = v.org_id;
  if p_until is not null and p_until < v_today then
    raise exception 'pause_until_past' using errcode = 'P0001';
  end if;

  update public.accounts
  set paused_at = now(), pause_reason = p_reason, paused_until = p_until, detail_version = now()
  where id = v.id;

  perform app.log_activity(
    v, 'pause', format('Chasing paused — %s', p_reason),
    case when p_until is null then 'No end date.'
         else format('Until %s.', to_char(p_until, 'FMDD Mon YYYY')) end,
    'warn'
  );
end;
$$;

/* Resume clears all three pause columns in one transaction (contract §2.4),
   and also lifts a Settings "don't chase" stop — Resume means chasing resumes. */
create or replace function public.account_resume(p_account uuid, p_if_match timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
begin
  v := app.lock_account_for_write(p_account, false);
  if v.detail_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;

  update public.accounts
  set paused_at = null, pause_reason = null, paused_until = null,
      chase_mode  = case when chase_mode = 'stopped' then 'default' else chase_mode end,
      stop_reason = case when chase_mode = 'stopped' then null else stop_reason end,
      stop_note   = case when chase_mode = 'stopped' then null else stop_note end,
      detail_version = now()
  where id = v.id;

  perform app.log_activity(v, 'resume', 'Chasing resumed', '', 'neutral');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: RPCs for signed-in users only.
-- ---------------------------------------------------------------------------
revoke execute on function public.account_contact_create(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function public.account_contact_update(uuid, uuid, timestamptz, jsonb) from public, anon;
revoke execute on function public.account_contact_delete(uuid, uuid, timestamptz) from public, anon;
revoke execute on function public.account_update_escalation(uuid, timestamptz, int, int) from public, anon;
revoke execute on function public.account_update_chasing_settings(uuid, timestamptz, jsonb) from public, anon;
revoke execute on function public.account_archive(uuid, timestamptz, text) from public, anon;
revoke execute on function public.account_pause(uuid, timestamptz, text, date) from public, anon;
revoke execute on function public.account_resume(uuid, timestamptz) from public, anon;

grant execute on function public.account_contact_create(uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.account_contact_update(uuid, uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.account_contact_delete(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.account_update_escalation(uuid, timestamptz, int, int) to authenticated;
grant execute on function public.account_update_chasing_settings(uuid, timestamptz, jsonb) to authenticated;
grant execute on function public.account_archive(uuid, timestamptz, text) to authenticated;
grant execute on function public.account_pause(uuid, timestamptz, text, date) to authenticated;
grant execute on function public.account_resume(uuid, timestamptz) to authenticated;

revoke execute on function app.lock_account_for_write(uuid, boolean) from public, anon, authenticated;
revoke execute on function app.log_activity(public.accounts, text, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function app.usable_p0_count(uuid) from public, anon, authenticated;
