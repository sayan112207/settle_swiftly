-- Turning provider events into a contact's delivery state.
--
-- Split deliberately into linking and applying, with the rule in neither.
--
-- `email_callbacks_link` is pure bookkeeping: it joins a stored event to the
-- send it belongs to. No judgement, so no duplication.
--
-- `email_delivery_apply` is a dumb writer. The policy that decides whether an
-- address is dead — one hard bounce, or SOFT_BOUNCE_LIMIT soft ones with no
-- delivery between — lives once, in `email-rules.ts`, where it is a pure
-- function with tests built from captured payloads. Restating it in PL/pgSQL
-- would put two copies of a rule on a collision course, which is the thing
-- this codebase keeps saying not to do.
--
-- What the RPC is for is atomicity: updating the contact and marking the
-- events consumed must not half-happen, and PostgREST gives every supabase-js
-- call its own transaction.

-- ---------------------------------------------------------------------------
-- Link stored events to the sends they belong to.
--
-- Matching is on (provider, provider_message_id), which `email_sends` holds a
-- unique index over. Events that match nothing stay unlinked: verification
-- mail is sent by Supabase Auth and has no send row here, and discarding its
-- bounces would throw away the only explanation for a user who never
-- confirmed.
-- ---------------------------------------------------------------------------
create or replace function public.email_callbacks_link()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linked integer;
begin
  update public.email_callbacks c
     set send_id = s.id,
         org_id  = s.org_id
    from public.email_sends s
   where c.send_id is null
     and c.provider_message_id is not null
     and s.provider = c.provider
     and s.provider_message_id = c.provider_message_id;

  get diagnostics v_linked = row_count;
  return v_linked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Write one contact's delivery verdict and consume the events behind it.
--
-- The caller has already computed the verdict from that contact's history.
-- Both writes land together or not at all: a contact marked bounced while its
-- events stay unprocessed would be re-judged on the next run, and events
-- marked processed without the contact updated would lose the bounce entirely.
-- ---------------------------------------------------------------------------
create or replace function public.email_delivery_apply(
  p_contact      uuid,
  p_state        public.delivery_state,
  p_last_bounced timestamptz,
  p_callback_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Attribute the write. auth.uid() is null for a background job, so without
  -- this the audit trail records nobody; app.tg_audit() reads this GUC, and it
  -- only survives because the set and the write share this transaction.
  perform set_config('app.actor_id', '', true);

  update public.contacts
     set delivery_state  = p_state,
         -- Never cleared here. A delivery moves the state back to 'verified'
         -- on its own; when the address last failed stays true regardless, and
         -- the bounce strip reads it to say how long nothing has arrived.
         last_bounced_at = coalesce(p_last_bounced, last_bounced_at)
   where id = p_contact;

  update public.email_callbacks
     set processed_at = now()
   where id = any(p_callback_ids)
     and processed_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retire events that will never find a contact.
--
-- Grace period rather than immediate: a callback can in principle arrive
-- before its send row is committed, and sweeping it straight away would
-- discard an event that was one second from matching. An hour is far longer
-- than that race and far shorter than anyone's debugging session.
-- ---------------------------------------------------------------------------
create or replace function public.email_callbacks_sweep_unmatched(
  p_older_than interval default interval '1 hour'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_swept integer;
begin
  update public.email_callbacks
     set processed_at = now()
   where processed_at is null
     and send_id is null
     and received_at < now() - p_older_than;

  get diagnostics v_swept = row_count;
  return v_swept;
end;
$$;

-- Background jobs only. These run as the service role, which bypasses RLS;
-- no signed-in user has any business marking a contact's address dead, since
-- a forged bounce silently stops an account being chased.
revoke execute on function public.email_callbacks_link() from public, anon, authenticated;
revoke execute on function public.email_delivery_apply(uuid, public.delivery_state, timestamptz, uuid[])
  from public, anon, authenticated;
revoke execute on function public.email_callbacks_sweep_unmatched(interval)
  from public, anon, authenticated;
