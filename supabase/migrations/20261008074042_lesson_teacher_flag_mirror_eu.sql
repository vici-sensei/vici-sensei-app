-- EU only. Needs 20261008074030_lesson_teacher_flag.sql applied to BOTH projects first (see its header).
-- US gets the mirror image, 20261008074043_lesson_teacher_flag_mirror_us.sql.
--
-- is_teacher into the US mirror. Same drift class as 20260923152656_premium_trial_admin_eu.sql:
-- mirror_us.users is a `LIKE` snapshot and mirror_us_fdw.users a frozen IMPORT, and
-- mirror_us.refresh_all() copies users with a positional `SELECT *` -- both must gain the column in
-- the same trailing position public.users just did, then admin_all.users is re-expanded.
--
-- Nothing else here: the Teacher panel's roster does not show the flag yet, and the flag is toggled
-- by the Worker (service role, with the lesson writer's side effects), not by an admin_* RPC.

ALTER FOREIGN TABLE mirror_us_fdw.users ADD COLUMN IF NOT EXISTS is_teacher boolean;

ALTER TABLE mirror_us.users ADD COLUMN IF NOT EXISTS is_teacher boolean;

CREATE OR REPLACE VIEW admin_all.users AS
  SELECT * FROM public.users
  UNION ALL
  SELECT * FROM mirror_us.users;

REVOKE ALL ON admin_all.users FROM anon, authenticated;
