-- account_contact_update: a contact moved to another tier now joins that tier
-- at the end. It used to keep its old position number, so it tied with (and
-- could sort ahead of) contacts already on the new tier. Other contacts are
-- still never reordered or re-tiered — contract §2.3.

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
    -- Moving tiers joins the new tier at the end; nobody else is reordered.
    sort_order       = case when v_tier = c.priority then sort_order
                            else (select count(*) from public.contacts o
                                  where o.account_id = v.id and o.priority = v_tier and o.id <> c.id)
                       end,
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
