-- Supabase Cron: wake the background jobs, and do nothing else.
--
-- See docs/chasing-scheduler-spec.md §8. The work stays in TypeScript, behind
-- `/api/v1/internal/*`; Postgres only decides *when*. pg_cron fires a job,
-- the job hands one HTTP request to pg_net, and pg_net delivers it after the
-- job's transaction has committed. Nothing here knows what a reminder is.
--
-- The secret is never in this file. The jobs read it from Vault at run time,
-- so `cron.job.command` holds a path and nothing else, and rotating the
-- secret is a Vault update rather than a migration. Until an operator stores
-- the two Vault secrets (README → Scheduled jobs) every run fails loudly in
-- `cron.job_run_details` with `cron_not_configured` — deliberately, rather
-- than posting to a null URL and reporting success.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- app.cron_post: one authenticated POST to the app
--
-- Returns pg_net's request id, which is what `cron.job_run_details` records.
-- That row only says the request was *queued*; whether the app answered 200
-- is in `net._http_response`, kept for six hours.
--
-- The timeout is the job's, not pg_net's 2-second default. The app runs on
-- Cloudflare, where a request whose client hangs up stops executing — so a
-- timeout shorter than the work cuts every run off part-way. Both endpoints
-- are idempotent, so a cut-off run is repaired by the next one, but a run
-- that is always cut off never finishes anything.
--
-- Security invoker on purpose. pg_cron runs a job as the role that scheduled
-- it, which is `postgres` here, and `postgres` can already read Vault; a
-- definer function would only widen who else could.
-- ---------------------------------------------------------------------------

create or replace function app.cron_post(
  p_path       text,
  p_timeout_ms integer default 60000
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_base   text;
  v_secret text;
begin
  select s.decrypted_secret into v_base
    from vault.decrypted_secrets s where s.name = 'cron_app_url';
  select s.decrypted_secret into v_secret
    from vault.decrypted_secrets s where s.name = 'cron_secret';

  if v_base is null or v_secret is null then
    raise exception 'cron_not_configured'
      using hint = 'Store cron_app_url and cron_secret in Vault. See README → Scheduled jobs.';
  end if;

  return net.http_post(
    url                  := rtrim(v_base, '/') || p_path,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'content-type', 'application/json',
                              'authorization', 'Bearer ' || v_secret
                            ),
    timeout_milliseconds := p_timeout_ms
  );
end;
$$;

-- `app` is usable by the API roles, and a new function is executable by
-- PUBLIC. Nobody but the cron owner has any business sending this request.
revoke execute on function app.cron_post(text, integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The jobs
--
-- Fixed to India time (spec §8): plan at 08:00 IST, send from 09:00 IST.
-- pg_cron reads schedules in UTC, and IST is UTC+05:30, so every IST hour is
-- half past a UTC one — a job "on the hour" here would never fire on the hour
-- in India.
--
-- The send job runs hourly to 19:00 IST rather than once at 9, so an account
-- whose custom send window opens later is still reached that day — 19:00 is
-- the last hour a window closing at 20:00, the latest Settings offers, is
-- still open. Each run only sends what the 8 o'clock plan queued and whose
-- window is open now.
-- ---------------------------------------------------------------------------

-- Read-mostly and idempotent: safe to run from the moment it exists.
select cron.schedule(
  'email-poll',
  '*/15 * * * *',
  $$select app.cron_post('/api/v1/internal/email/poll', 60000)$$
);

-- 08:00 IST. Writes today's queue; sends nothing.
select cron.schedule(
  'chase-plan',
  '30 2 * * *',
  $$select app.cron_post('/api/v1/internal/chase/plan', 300000)$$
);

-- 09:00 to 19:00 IST, on the hour.
select cron.schedule(
  'chase-send',
  '30 3-13 * * *',
  $$select app.cron_post('/api/v1/internal/chase/send', 300000)$$
);

-- Both chase jobs ship disabled (spec §8). A misconfigured job that mails
-- customers on a loop is the one failure here that cannot be rolled back, so
-- the first plan and the first send are run by hand and watched, and turning
-- the jobs on is a separate, deliberate act — see README → Scheduled jobs.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'chase-plan'),
  active := false
);
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'chase-send'),
  active := false
);

-- pg_cron never prunes its own history: one row per run, for ever, including
-- runs of jobs since unscheduled. A 15-minute job alone writes ~35,000 rows a
-- year. Two weeks is long enough to read back through an incident.
select cron.schedule(
  'cron-history-prune',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days'$$
);
