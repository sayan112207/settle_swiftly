-- chase_requests: state its table privileges explicitly.
--
-- 20260919120000_dashboard_api.sql relied on the project's default privileges
-- for `authenticated`. That works on this project, but newer Supabase projects
-- no longer grant Data API access to new public tables automatically, and the
-- migration should not depend on which kind of project it lands on.
--
-- The grant is the full set the table needs: SELECT backs
-- chase_requests_select_member, INSERT backs POST /api/v1/chases. RLS still
-- decides which rows either can touch.
--
-- TRUNCATE is revoked because it ignores RLS entirely. It is not reachable
-- through PostgREST today, but "append-only" should hold at the database, not
-- only because the HTTP layer happens not to expose a verb.

revoke all on table public.chase_requests from anon, authenticated;
grant select, insert on table public.chase_requests to authenticated;
