-- `p_last_bounced` takes a default, so it can be omitted rather than passed
-- null. The body already treats null as "leave the column alone" via coalesce;
-- this only changes how the argument is expressed.
--
-- The reason is on the TypeScript side: `types.gen.ts` types every RPC
-- argument as non-null, because a Postgres parameter is nullable by default
-- and the generator cannot see which ones mean it. Giving this one a default
-- makes the generated argument optional, so "no bounce to record" is a key
-- that is absent rather than a null cast past the type system.
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
  perform set_config('app.actor_id', '', true);

  update public.contacts
     set delivery_state  = p_state,
         last_bounced_at = coalesce(p_last_bounced, last_bounced_at)
   where id = p_contact;

  update public.email_callbacks
     set processed_at = now()
   where id = any(p_callback_ids)
     and processed_at is null;
end;
$$;

-- The old four-argument ordering is gone; dropping it keeps one callable
-- signature rather than two that can drift.
drop function if exists public.email_delivery_apply(uuid, public.delivery_state, timestamptz, uuid[]);

revoke execute on function public.email_delivery_apply(uuid, public.delivery_state, uuid[], timestamptz)
  from public, anon, authenticated;
