-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- morphology_rules is public but has no RLS, unlike every other table in
-- the schema (flagged by Supabase's security advisor as CRITICAL). The
-- table is still under construction and not yet wired into any app code
-- (see AGENTS.md/repo search -- nothing references it), so no policies
-- are added here: RLS is simply enabled with zero grants, which blocks
-- all access via the anon/authenticated PostgREST roles. Only the
-- service-role client (used server-side, bypasses RLS entirely) can
-- still read/write it. Add SELECT/INSERT/UPDATE policies here once the
-- table's real access pattern is decided.

alter table public.morphology_rules enable row level security;
