-- US only. Needs 20260923152640_premium_trial.sql applied to BOTH projects first (see its header).
-- Mirror image of 20260923152656_premium_trial_admin_eu.sql -- mirror_eu/mirror_eu_fdw instead of
-- mirror_us/mirror_us_fdw, and 'us'/'eu' region labels swapped (this project's own public.* is 'us'
-- here).
--
-- (1) premium_until into the EU mirror. Same drift class 20260923051955_mirror_us_users_add_retired_to_region.sql
--     fixed: mirror_eu.users is a `LIKE` snapshot and mirror_eu_fdw.users a frozen IMPORT, and
--     mirror_eu.refresh_all() copies users with a positional `SELECT *` -- both must gain the column
--     in the same trailing position public.users just did (verified live before writing this: all
--     four column lists identical, ending in retired_to_region), then admin_all.users re-expanded.
-- (2) admin_get_student_roster returns what /admin/students needs to show and filter Pro access:
--     premium_until, has_stripe (never the customer id itself), region and study_track.
-- (3) admin_set_student_premium, the Teacher panel's Pro toggle -- writes through to whichever
--     project the student lives in, same pattern as admin_update_lead_contacted.

-- ---------- (1) Mirror parity ----------

ALTER FOREIGN TABLE mirror_eu_fdw.users ADD COLUMN premium_until timestamp with time zone;

ALTER TABLE mirror_eu.users ADD COLUMN IF NOT EXISTS premium_until timestamp with time zone;

CREATE OR REPLACE VIEW admin_all.users AS
  SELECT * FROM public.users
  UNION ALL
  SELECT * FROM mirror_eu.users;

REVOKE ALL ON admin_all.users FROM anon, authenticated;

-- ---------- (2) Roster ----------

-- Return type is changing (new trailing columns), so the old signature has to be dropped first.
DROP FUNCTION public.admin_get_student_roster();

CREATE FUNCTION public.admin_get_student_roster()
RETURNS TABLE(
  id uuid, display_name text, email text, avatar_url text, country text, is_premium boolean,
  created_at timestamp with time zone, current_streak integer, longest_streak integer,
  last_active_date date, reviews_count bigint, new_cards_count bigint, learned_count bigint,
  practice_count bigint, test_count bigint, xp_points bigint,
  premium_until timestamp with time zone, has_stripe boolean, region text, study_track text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    u.id, u.display_name, u.email, u.avatar_url, u.country, u.is_premium, u.created_at,
    public.streak_display_count(
      ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
      public.study_day(now(), coalesce(s.timezone, 'UTC'))
    ),
    coalesce(ls.longest_streak, 0), ls.last_active_date,
    coalesce(ls.reviews_count, 0), coalesce(ls.new_cards_count, 0),
    coalesce(learned.cnt, 0), coalesce(practice.cnt, 0), coalesce(ls.test_count, 0),
    coalesce(ls.xp_points, 0),
    u.premium_until, u.stripe_customer_id is not null, u.region, s.study_track
  from (
    -- Region-tagged at the source, same as admin_get_student_detail -- admin_all.users carries no
    -- origin column.
    select id, display_name, email, avatar_url, country, is_premium, premium_until, stripe_customer_id,
           created_at, pending_deletion_at, 'us'::text as region from public.users
    union all
    select id, display_name, email, avatar_url, country, is_premium, premium_until, stripe_customer_id,
           created_at, pending_deletion_at, 'eu'::text as region from mirror_eu.users
  ) u
  left join admin_all.leaderboard_stats ls on ls.user_id = u.id
  left join admin_all.user_study_settings s on s.user_id = u.id
  left join (
    select user_id, count(*) as cnt from (
      select user_id from admin_all.user_hiragana_progress where graduated_at is not null
      union all
      select user_id from admin_all.user_katakana_progress where graduated_at is not null
    ) g group by user_id
  ) learned on learned.user_id = u.id
  left join (
    select user_id, count(*) as cnt from admin_all.practice_logs group by user_id
  ) practice on practice.user_id = u.id
  where public.is_admin() and u.pending_deletion_at is null;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_roster() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_roster() TO authenticated;

-- ---------- (3) Pro toggle ----------

-- p_premium_until NULL = no end date; ignored (stored as NULL) when turning Pro off. A student whose
-- Pro comes from an active Stripe subscription is left alone -- stripe-webhook would overwrite
-- whatever is set here on the next billing event anyway -- so the guard is in the UPDATE itself,
-- and "not found" covers both an unknown id and a Stripe-managed one.
CREATE FUNCTION public.admin_set_student_premium(p_user_id uuid, p_is_premium boolean, p_premium_until timestamp with time zone)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_until timestamp with time zone := CASE WHEN p_is_premium THEN p_premium_until END;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_until IS NOT NULL AND v_until <= now() THEN
    RAISE EXCEPTION 'The Pro end date must be in the future' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users SET is_premium = p_is_premium, premium_until = v_until
  WHERE id = p_user_id AND NOT (is_premium AND stripe_customer_id IS NOT NULL);

  IF NOT FOUND THEN
    UPDATE mirror_eu_fdw.users SET is_premium = p_is_premium, premium_until = v_until
    WHERE id = p_user_id AND NOT (is_premium AND stripe_customer_id IS NOT NULL);

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Student not found, or their Pro access comes from a Stripe subscription' USING ERRCODE = 'P0002';
    END IF;

    -- The local snapshot too, so the roster shows the change right away instead of after the next
    -- 5-minute mirror_eu.refresh_all().
    UPDATE mirror_eu.users SET is_premium = p_is_premium, premium_until = v_until WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_student_premium(uuid, boolean, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_student_premium(uuid, boolean, timestamp with time zone) TO authenticated;
