-- A brand-new Supabase project bootstraps `public` with broader default privileges
-- (roughly `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES/FUNCTIONS
-- TO anon, authenticated`) BEFORE any of our own migrations run. Because GRANT only
-- ADDS privileges and never revokes an inherited one, the baseline's own explicit
-- GRANT statements for these 4 objects don't strip that inherited excess -- they never
-- needed to on the live project, because these 4 objects predate migration tracking
-- (created back when the live project's schema-level default privileges were already
-- narrow, long before 20260921000000_baseline.sql existed).
--
-- Found by diffing a full schema/ACL fingerprint of the new eu-central-1 and us-east-1
-- projects against the live EU project (hmbemylaqnkiamvhcdcd) right after
-- 20260921000000_baseline.sql was pushed to both, 2026-09-22. RLS was already enabled
-- on every table below throughout, so this closes a defense-in-depth gap (excess
-- table/function-level grants), not an open RLS hole.
--
-- Not applied to hmbemylaqnkiamvhcdcd (the live project): it already has the correct,
-- narrower grants and was the source of truth for what "correct" means here. This
-- migration exists for the two new regions (and any future one) that go through
-- `db push` on an empty project rather than inheriting the live project's history.

revoke all on table public.free_lesson_leads from anon, authenticated;
grant insert on table public.free_lesson_leads to anon;
grant select on table public.free_lesson_leads to authenticated;
-- the baseline's column-level `grant update(contacted) ... to authenticated` is a
-- separate ACL entry, untouched by a table-level revoke, and stays correct.

revoke update on table public.users from authenticated;
-- the baseline's column-level grants (display_name, avatar_url, country,
-- show_country_on_leaderboard) are untouched and stay correct. anon's `grant all`
-- already matches the live project (RLS keeps anon from ever matching a row) and is
-- left as-is.

revoke update on table public.vocabulary from authenticated;
-- the baseline's column-level `grant update(short_meaning) ... to authenticated` is
-- untouched and stays correct.

revoke all on function public.is_admin() from anon;
