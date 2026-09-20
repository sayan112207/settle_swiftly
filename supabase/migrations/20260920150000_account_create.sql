-- Creating an account from inside the product.
--
-- Until now `accounts` was only ever populated out of band, so a new org had
-- no way to add its first invoice: both paths on Add entries require an
-- account that already exists — the manual form lists them in a select, and
-- the CSV importer matches its account column against them. A fresh workspace
-- was a dead end. This adds the one write that was missing.
--
-- Batch, not single-row, because the import path needs it: a CSV names its
-- accounts in a column, and resolving two hundred names one request at a time
-- is two hundred round trips. A single name is a one-element array.
--
-- Why an RPC rather than an insert through RLS (accounts_rw_member already
-- allows one): resolving a name to an *existing* account keys on
-- name_normalized, which is app.normalize_account_name() — "Northline Creative
-- Pvt Ltd" and "Northline Creative" are the same debtor, and the frontend
-- cannot tell. Reimplementing that function in TypeScript would put two copies
-- of the domain's duplicate rule on a collision course. The match belongs
-- where the function lives.

/* Resolves each name to an account id, creating the ones that do not exist
   yet, and reports which of the two happened per name.

   Returning existing matches rather than raising on them is deliberate: an
   import that names a known customer must land on that customer, and the
   manual form would rather select the existing account than make the user
   rename theirs. `was_created` lets the caller word it either way.

   A name matching an archived account returns that account. The unique index
   spans archived rows, so a second one cannot be created — surfacing the
   archived account is the only honest answer available. */
create or replace function public.accounts_ensure(p_org uuid, p_names text[])
returns table (requested_name text, account_id uuid, account_name text, was_created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The ids this call actually inserted, so `was_created` stays truthful once
  -- the insert and the read are separate statements.
  v_created uuid[];
begin
  if not app.is_org_member(p_org) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Two statements, not one, and that is the whole point.
  --
  -- Resolving in the same statement as the insert looks tidier and is wrong
  -- under concurrency: ON CONFLICT DO NOTHING skips a name another session
  -- committed a moment ago, while a plain read of the table still sees the
  -- statement-start snapshot that predates that commit. Neither side matches,
  -- and the caller gets a NULL account_id for a name that plainly exists.
  -- Splitting the read into its own statement gives it a fresh snapshot in
  -- READ COMMITTED, which is where the winner's row becomes visible.
  -- Statement one: create whatever this org is missing.
  --
  -- `name` is what gets stored. Internal runs of whitespace collapse, because
  -- "Sharma   Traders" out of a spreadsheet cell is the same name badly typed
  -- and would otherwise keep that spacing in every list and every email
  -- forever. Case is left alone: the user's capitalisation is theirs. `norm`
  -- is the duplicate-detection key, the database's own.
  with input as (
    select distinct
      regexp_replace(btrim(n), '\s+', ' ', 'g') as name,
      app.normalize_account_name(btrim(n)) as norm
    from unnest(p_names) as n
    where btrim(coalesce(n, '')) <> ''
  ),
  -- One insert per *normalized* name. A CSV naming the same debtor two ways
  -- ("Sharma Traders" and "Sharma Traders Pvt Ltd") would otherwise try to
  -- insert both and self-conflict inside a single statement, which ON CONFLICT
  -- does not cover.
  to_insert as (
    select distinct on (norm) norm, name from input order by norm, name
  ),
  ins as (
    insert into public.accounts (org_id, name)
    select p_org, t.name from to_insert t
    on conflict (org_id, name_normalized) do nothing
    returning id
  )
  select coalesce(array_agg(ins.id), '{}'::uuid[]) into v_created from ins;

  -- Statement two: resolve every requested name against a fresh snapshot.
  --
  -- A row per *requested* name rather than per normalized group, so a caller
  -- can map every name it sent back to an id; `requested` is the caller's own
  -- spelling, trimmed. Collapsed duplicates resolve to the same account.
  --
  -- An inner join: by now the row exists, whoever inserted it. If a name still
  -- fails to match, the account was deleted underneath us, and returning
  -- nothing for it is better than a NULL id the caller has to special-case —
  -- the frontend already fails the batch loudly on a name that came back
  -- unanswered.
  return query
  with input as (
    select distinct
      btrim(n) as requested,
      app.normalize_account_name(btrim(n)) as norm
    from unnest(p_names) as n
    where btrim(coalesce(n, '')) <> ''
  )
  select i.requested, a.id, a.name, a.id = any(v_created)
  from input i
  join public.accounts a
    on a.org_id = p_org and a.name_normalized = i.norm;
end;
$$;

comment on function public.accounts_ensure(uuid, text[]) is
  'Resolves account names to ids for the org, creating the missing ones.';

revoke execute on function public.accounts_ensure(uuid, text[]) from public, anon;
grant execute on function public.accounts_ensure(uuid, text[]) to authenticated;
