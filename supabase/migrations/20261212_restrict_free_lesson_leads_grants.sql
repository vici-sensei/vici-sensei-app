-- free_lesson_leads has never had a CREATE TABLE migration in this repo (it was created directly
-- in the Supabase dashboard), so it never went through the same privilege-restriction pass that
-- 20260730_restrict_users_column_grants.sql gave public.users. As a result `anon` and
-- `authenticated` still hold the dashboard's default full table privileges -- including TRUNCATE,
-- which (unlike SELECT/INSERT/UPDATE/DELETE) is NOT gated by row-level security at all in
-- Postgres. Any anon request could truncate this table outright, bypassing RLS entirely.
--
-- Scope both roles down to exactly what's actually used, the same REVOKE-then-GRANT pattern as
-- 20260730_restrict_users_column_grants.sql and 20261208_admin_can_update_free_lesson_leads_contacted.sql:
--   - anon only ever inserts a new lead via the public signup form (policy "Anyone can submit a
--     free lesson lead") -- never reads, updates, or deletes, and RLS already blocked those for
--     anon anyway (no permissive policy existed), so this changes no working behavior.
--   - authenticated only ever reads (admins, via "Admins can view free_lesson_leads") and updates
--     `contacted` (admins, via "Admins can update free_lesson_leads contacted") -- RLS already
--     blocked INSERT/DELETE for authenticated the same way, so this changes no working behavior
--     either. Only TRUNCATE was actually exploitable for either role.

revoke all on public.free_lesson_leads from anon;
grant insert on public.free_lesson_leads to anon;

revoke all on public.free_lesson_leads from authenticated;
grant select on public.free_lesson_leads to authenticated;
grant update (contacted) on public.free_lesson_leads to authenticated;

-- Two INSERT policies existed for `anon` with the exact same unconditional check -- already
-- flagged as redundant in 20261111_admin_can_view_free_lesson_leads.sql's own comment, never
-- cleaned up. Keep "Anyone can submit a free lesson lead", drop the older duplicate.
drop policy if exists "Allow public inserts on free_lesson_leads" on public.free_lesson_leads;
