-- Chasing is opt-in, per account.
--
-- An account starts with its cadence set to "Don't chase", reason "Not set up
-- yet", and nothing goes out until someone picks the default or a custom
-- cadence in its Settings, or presses Resume. The scheduler already holds a
-- stopped account (its status resolves to `paused`), so this is defaults and
-- data, not new machinery.

alter table public.accounts
  drop constraint accounts_stop_reason_check,
  add constraint accounts_stop_reason_check check (
    stop_reason in (
      'Dispute', 'Payment plan agreed', 'Client request', 'Relationship hold', 'Other',
      'Not set up yet'
    )
  ),
  alter column chase_mode set default 'stopped',
  -- Paired with the mode's default, for an insert that sets neither — today
  -- that is every insert (`account_create`). The settings save and Resume
  -- clear it whenever the mode leaves 'stopped'.
  alter column stop_reason set default 'Not set up yet';

-- Every account being chased today is switched off until its owner turns it
-- back on. Accounts already stopped keep their own reason. `detail_version`
-- moves so an open Settings form reloads instead of saving over this.
update public.accounts
set chase_mode = 'stopped',
    stop_reason = 'Not set up yet',
    stop_note = null,
    detail_version = now()
where chase_mode <> 'stopped';
