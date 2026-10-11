-- Outbound email: what we handed the provider, and what it told us afterwards.
--
-- The provider (SMTP2GO) is used in two places, and they are not symmetric:
--
--   1. Chase reminders — this app POSTs them to /v3/email/send and gets back an
--      `email_id`. We control the call, so we can record it.
--   2. User verification — Supabase Auth sends these over SMTP, from Supabase's
--      infrastructure. This app never sees the send, so there is NO hook to
--      write a row for it.
--
-- Both land in the same SMTP2GO account, so its webhook fires for both. That
-- asymmetry is the whole design: `email_sends` covers what we sent, while
-- `email_callbacks` must stay useful for mail we have no send row for. A
-- verification bounce is worth knowing about — it means a user typo'd their
-- address and will never confirm — so callbacks carry the recipient address
-- themselves rather than relying on a join that will often miss.

create type public.email_purpose as enum ('reminder', 'verification');

-- The lifecycle of OUR handoff to the provider, not of delivery. Delivery is
-- the provider's verdict and arrives later, as callbacks.
create type public.email_send_status as enum ('queued', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- email_sends — one row per recipient, per message.
--
-- Per recipient, not per reminder: escalation is cumulative, so one reminder
-- fans out to P0, P1 and P2, and a bounce belongs to one of them. A row per
-- reminder could not say which address failed, which is the only thing
-- `contacts.delivery_state` cares about.
-- ---------------------------------------------------------------------------
create table public.email_sends (
  id         uuid primary key default gen_random_uuid(),

  -- Nullable because a verification email can precede the user having an org
  -- at all. Reminders always have one — the check constraint below holds that.
  org_id     uuid references public.orgs (id) on delete cascade,
  purpose    public.email_purpose not null,

  -- Named rather than assumed: swapping provider must not silently merge two
  -- providers' id spaces, which is why uniqueness below is per provider.
  provider   text not null default 'smtp2go' check (btrim(provider) <> ''),
  -- The provider's own id for the message, used to join callbacks back to this
  -- row. NULL until the API accepts it — a `failed` send never gets one.
  provider_message_id text,

  to_email   text not null check (btrim(to_email) <> ''),
  subject    text,

  -- Which reminder and which contact this was, when it was a reminder.
  -- `set null` on both: send history outlives the contact it went to, and
  -- `to_email` preserves the address regardless.
  reminder_id uuid references public.reminders (id) on delete set null,
  contact_id  uuid references public.contacts (id) on delete set null,

  status     public.email_send_status not null default 'queued',
  -- The provider's refusal, verbatim, when status is 'failed'.
  error      text,

  created_at timestamptz not null default now(),
  sent_at    timestamptz,

  constraint email_sends_reminder_has_org
    check (purpose <> 'reminder' or org_id is not null),
  constraint email_sends_sent_has_message_id
    check (status <> 'sent' or provider_message_id is not null)
);

-- The join target for callbacks. Partial, because queued and failed sends
-- legitimately share a NULL id and must not collide.
create unique index email_sends_provider_message_uniq
  on public.email_sends (provider, provider_message_id)
  where provider_message_id is not null;

create index email_sends_org_created_idx on public.email_sends (org_id, created_at desc);
create index email_sends_reminder_idx on public.email_sends (reminder_id);
create index email_sends_contact_idx on public.email_sends (contact_id);
-- Verification mail has no org and no contact, so address is the only handle
-- on it: "did this user's confirmation actually go out".
create index email_sends_to_email_idx on public.email_sends (lower(to_email));

-- ---------------------------------------------------------------------------
-- email_callbacks — every event the provider reports, matched or not.
--
-- Stored raw and then interpreted, rather than parsed into columns at the
-- door. A webhook cannot be re-requested: if the parse is wrong, or a field
-- turns out to matter later, the payload is the only way back. `payload` is
-- the record; the columns beside it are an index over it.
-- ---------------------------------------------------------------------------
create table public.email_callbacks (
  id         uuid primary key default gen_random_uuid(),
  provider   text not null default 'smtp2go' check (btrim(provider) <> ''),

  -- Both nullable on purpose. An event for a Supabase-sent verification email
  -- matches no send row, and refusing it would throw away the bounce that
  -- explains why a user never confirmed. Resolved opportunistically, after
  -- the row is safely stored.
  send_id    uuid references public.email_sends (id) on delete set null,
  org_id     uuid references public.orgs (id) on delete cascade,

  provider_message_id text,
  -- The provider's event id, where it supplies one. Free text rather than an
  -- enum: an unrecognised event must still be stored, not rejected at the door.
  provider_event_id   text,
  event      text not null check (btrim(event) <> ''),

  -- Copied out of the payload so unmatched events are still queryable by who
  -- they were about.
  to_email   text,

  payload    jsonb not null,

  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  -- Null until the event has been applied to the things it affects, e.g. a
  -- bounce setting contacts.delivery_state. The worker's queue.
  processed_at timestamptz
);

-- Webhooks redeliver. Dedupe on the provider's event id where it gives one;
-- where it does not, the apply step is written to be idempotent instead —
-- setting delivery_state to 'bounced' twice costs nothing. Tighten this once
-- the real payload shape is known; `payload` is kept so that is possible.
create unique index email_callbacks_provider_event_uniq
  on public.email_callbacks (provider, provider_event_id)
  where provider_event_id is not null;

create index email_callbacks_message_idx
  on public.email_callbacks (provider, provider_message_id)
  where provider_message_id is not null;
create index email_callbacks_send_idx on public.email_callbacks (send_id);
create index email_callbacks_org_idx on public.email_callbacks (org_id, received_at desc);
-- The work queue, in the shape of reminders_due_idx: only the unprocessed
-- rows, which is the only set the worker ever scans.
create index email_callbacks_unprocessed_idx
  on public.email_callbacks (received_at)
  where processed_at is null;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Read-only to members, and only for their own org. Neither table is written
-- by a signed-in user: sends come from the server-side sender and callbacks
-- from an endpoint with no session at all, both of which use the service role
-- and bypass RLS. Granting insert to `authenticated` would let a browser
-- fabricate delivery events, and a forged bounce silently stops an account
-- being chased.
--
-- Rows with a null org_id — verification mail, unmatched callbacks — are
-- visible to nobody through RLS. That is correct: they belong to the platform,
-- not to a tenant.
-- ---------------------------------------------------------------------------
alter table public.email_sends enable row level security;
alter table public.email_callbacks enable row level security;

create policy email_sends_select_member on public.email_sends
  for select to authenticated
  using (org_id is not null and app.is_org_member(org_id));

create policy email_callbacks_select_member on public.email_callbacks
  for select to authenticated
  using (org_id is not null and app.is_org_member(org_id));

-- No app.tg_audit() on either table, deliberately. The audit log answers "who
-- changed this", and nobody changes these — they are append-only machine
-- records, and a webhook storm would bury real user actions under delivery
-- receipts. `activity_log` is treated the same way.

comment on table public.email_sends is
  'One row per recipient per outbound message we sent. Verification mail sent by Supabase Auth over SMTP has no row here — only its callbacks arrive.';
comment on table public.email_callbacks is
  'Raw provider delivery events, for sent mail and for mail we have no send row for. send_id and org_id are resolved after storage, and stay null when nothing matches.';
