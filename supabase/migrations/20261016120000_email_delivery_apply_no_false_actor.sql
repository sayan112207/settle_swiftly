-- Stop claiming an actor this write does not have.
--
-- `email_delivery_apply` opened with:
--
--     perform set_config('app.actor_id', '', true);
--
-- under a comment saying it attributed the write. It did not. `app.tg_audit()`
-- reads the GUC as `nullif(current_setting('app.actor_id', true), '')::uuid`,
-- so an empty string is exactly as anonymous as never setting it — the line
-- was a no-op, and the comment above it was wrong. A misleading comment in an
-- audit path is worse than none: the next person reads it, believes the trail
-- is attributed, and stops checking.
--
-- Removed rather than filled in, because there is no actor to name. This runs
-- from a background poller with no signed-in user, and the schema has no
-- system account to borrow. Inventing a sentinel UUID would put a person who
-- does not exist against a row in `audit_log`, which is a worse failure than
-- a null: a null says "nobody was logged in", a fake id says "this person did
-- it".
--
-- So `audit_log.actor_id` is NULL for these writes, by design. The row still
-- records the table, the record, the operation and the before/after — what is
-- missing is only the who, and for a provider-driven delivery verdict there
-- genuinely is no who. When a real system identity exists, the honest fix is
-- to set it here.
--
-- Body is otherwise unchanged from 20261011140000, which is the signature
-- currently deployed.

create or replace function public.email_delivery_apply(
  p_contact      uuid,
  p_state        public.delivery_state,
  p_callback_ids uuid[],
  p_last_bounced timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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

revoke execute on function public.email_delivery_apply(uuid, public.delivery_state, uuid[], timestamptz)
  from public, anon, authenticated;
