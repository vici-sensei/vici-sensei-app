-- EU only. mirror_us.users was created (20260922203458_admin_mirror_us_schema.sql, 2026-09-22) via
-- `LIKE public.users INCLUDING DEFAULTS INCLUDING INDEXES` -- a point-in-time schema snapshot, not
-- a view, so it never picked up `retired_to_region`, added to public.users afterward by
-- 20260923012239_region_move_retirement.sql (2026-09-23). Found while writing
-- 20260923044546_admin_leads_mirror_and_student_region_eu.sql: a fresh `SELECT * FROM public.users
-- UNION ALL SELECT * FROM mirror_us.users` there failed with "each UNION query must have the same
-- number of columns" (worked around there with an explicit column list). admin_all.users itself
-- didn't error because a view's `SELECT *` is expanded and frozen at CREATE VIEW time, and that
-- view was created before the column existed on either side.
--
-- US-new's mirror_eu.users doesn't have this problem -- it was created later
-- (20260923024343_admin_mirror_eu_schema_views_functions.sql), after region_move_retirement had
-- already run, so its LIKE-snapshot already included the column. EU-only fix.
--
-- Not carrying over `users_retired_to_region_check` -- mirror_us.users was deliberately created
-- without CHECK/FK constraints (see the schema migration's own comment), same as every other
-- mirrored table; this just restores column parity, not full DDL parity.
--
-- mirror_us_fdw.users (the live FDW read of US-new's public.users, set up via IMPORT FOREIGN
-- SCHEMA at Phase 6 time) has the SAME drift, for the same reason -- frozen at import time, before
-- retired_to_region existed on either side. This one matters more: mirror_us.refresh_all() does
-- `INSERT INTO mirror_us.users SELECT * FROM mirror_us_fdw.users` with no explicit column list, so
-- fixing only mirror_us.users without also fixing mirror_us_fdw.users would make the very next
-- 5-minute cron tick fail with "INSERT has more target columns than expressions" and abort the
-- whole refresh_all() call -- breaking replication for all 16 mirrored tables, not just this one.
-- Unlike CREATE USER MAPPING/IMPORT FOREIGN SCHEMA, ALTER FOREIGN TABLE ADD COLUMN needs no live
-- credentials (postgres_fdw matches foreign-table columns to the remote table by name), so this is
-- a plain, safely-committed statement, not an uncommitted companion step.

ALTER FOREIGN TABLE mirror_us_fdw.users ADD COLUMN retired_to_region text;

ALTER TABLE mirror_us.users ADD COLUMN IF NOT EXISTS retired_to_region text;

-- admin_all.users's SELECT * was frozen at the old (14-column) shape -- CREATE OR REPLACE with the
-- same query text re-expands it now that both sides match again, so the view starts returning
-- retired_to_region too (it returns nothing new to callers today -- no admin_* function selects it
-- -- but callers that DO `SELECT *` against admin_all.users will see it from here on).
CREATE OR REPLACE VIEW admin_all.users AS
  SELECT * FROM public.users
  UNION ALL
  SELECT * FROM mirror_us.users;

REVOKE ALL ON admin_all.users FROM anon, authenticated;
