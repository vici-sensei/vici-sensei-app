-- US only. Needs 20261008074030_lesson_teacher_flag.sql applied to BOTH projects first (see its header).
-- Mirror image of 20261008074042_lesson_teacher_flag_mirror_eu.sql -- mirror_eu/mirror_eu_fdw instead
-- of mirror_us/mirror_us_fdw.
--
-- is_teacher into the EU mirror: mirror_eu.users (snapshot) and mirror_eu_fdw.users (frozen IMPORT)
-- must gain the column in the same trailing position public.users just did, because
-- mirror_eu.refresh_all() copies users with a positional `SELECT *`; then admin_all.users is
-- re-expanded.

ALTER FOREIGN TABLE mirror_eu_fdw.users ADD COLUMN IF NOT EXISTS is_teacher boolean;

ALTER TABLE mirror_eu.users ADD COLUMN IF NOT EXISTS is_teacher boolean;

CREATE OR REPLACE VIEW admin_all.users AS
  SELECT * FROM public.users
  UNION ALL
  SELECT * FROM mirror_eu.users;

REVOKE ALL ON admin_all.users FROM anon, authenticated;
