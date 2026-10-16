-- Retire callbacks that are linked but can never be applied.
--
-- The sweep only retired rows with no `send_id`, which left a second dead
-- class untouched: a callback linked to a send that has no `contact_id`.
-- That is reachable two ways — `email_sends.contact_id` is `on delete set
-- null`, so retiring a contact leaves its send history behind, and a
-- verification send has no contact to begin with.
--
-- Those rows can never produce a delivery verdict, so `applyVerdicts` skips
-- them, so `processed_at` stays null, so every later run reads them again.
-- The queue grows for ever and the partial index behind it with it.
--
-- Same grace period for both classes. For the linked-but-contactless rows it
-- is not strictly needed — the link has already happened, so nothing is
-- pending — but one rule is easier to reason about than two, and an hour
-- costs nothing.
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
  update public.email_callbacks c
     set processed_at = now()
   where c.processed_at is null
     and c.received_at < now() - p_older_than
     and (
       -- never matched a send at all
       c.send_id is null
       -- or matched one that cannot name a contact to judge
       or exists (
         select 1 from public.email_sends s
          where s.id = c.send_id and s.contact_id is null
       )
     );

  get diagnostics v_swept = row_count;
  return v_swept;
end;
$$;

revoke execute on function public.email_callbacks_sweep_unmatched(interval)
  from public, anon, authenticated;
