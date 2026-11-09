-- Waitlist: keep the company a visitor gives on the closing early-access form.
--
-- Optional, so nullable. Capped like the other columns on this table: it
-- accepts anonymous INSERT, so unbounded text would be a storage vector.
alter table public.waitlist
  add column company text,
  add constraint waitlist_company_length check (company is null or length(company) <= 200);
