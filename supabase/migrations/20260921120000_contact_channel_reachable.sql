-- A channel switched on with nothing to send to.
--
-- `contacts_reachable` only asks for an email OR a phone. A contact created
-- with an email alone still carries channel_email = true (the column default)
-- and can have WhatsApp or SMS switched on afterwards, at which point the
-- product queues reminders against a number that does not exist: the account
-- reads as chased, and nothing has gone out. The add-contact form refuses this
-- combination, but the form is not the only writer — the RPCs and any later
-- import path reach the same rows.
--
-- WhatsApp and SMS both dial `phone`, so they share one arm of the check.

-- Existing rows first, or the constraint cannot be added. Both updates turn the
-- channel off rather than inventing an address: a channel that was never going
-- to deliver is already off in every sense but the flag.
update public.contacts
   set channel_email = false
 where channel_email
   and btrim(coalesce(email, '')) = '';

update public.contacts
   set channel_whatsapp = false,
       channel_sms      = false
 where (channel_whatsapp or channel_sms)
   and btrim(coalesce(phone, '')) = '';

alter table public.contacts drop constraint if exists contacts_channel_reachable;
alter table public.contacts add constraint contacts_channel_reachable check (
  (not channel_email or btrim(coalesce(email, '')) <> '')
  and (not (channel_whatsapp or channel_sms) or btrim(coalesce(phone, '')) <> '')
);
