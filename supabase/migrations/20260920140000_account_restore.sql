-- Archive becomes reversible, Gmail-style: an archived account stays readable
-- under Accounts → Archived, is left out of totals and chasing, and an admin
-- can restore it.
--
-- 1. Mutations on an archived account now fail with `account_archived` rather
--    than `not_found`: the account is visible, so "not found" would be false.
-- 2. public.account_restore(): the one write allowed on an archived account.

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
  if v.id is null or not app.is_org_member(v.org_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v.archived_at is not null then
    raise exception 'account_archived' using errcode = 'P0001';
  end if;
  if p_require_admin
     and not app.has_org_role(v.org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return v;
end;
$$;

/* Restores an archived account. Admin-only, like archiving; guarded by the
   same detail_version If-Match token. */
create or replace function public.account_restore(p_account uuid, p_if_match timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.accounts;
begin
  select * into v from public.accounts a where a.id = p_account for update;
  if v.id is null or not app.is_org_member(v.org_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not app.has_org_role(v.org_id, array['owner', 'admin']::public.org_role[]) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v.detail_version is distinct from p_if_match then
    raise exception 'stale_write' using errcode = 'P0001';
  end if;
  if v.archived_at is null then
    raise exception 'not_archived' using errcode = 'P0001';
  end if;

  update public.accounts set archived_at = null, detail_version = now() where id = v.id;
  perform app.log_activity(v, 'settings_changed', 'Account restored', '', 'neutral');
end;
$$;

revoke execute on function public.account_restore(uuid, timestamptz) from public, anon;
grant execute on function public.account_restore(uuid, timestamptz) to authenticated;
