-- EU only. US gets the mirror image, 20260923165828_admin_student_detail_premium_until_us.sql.
--
-- admin_get_student_detail also returns premium_until, so the student detail page's overview can
-- show when Pro ends (NULL = no end date), same as the roster's Pro column. mirror_us.users already
-- has the column (20260923152656_premium_trial_admin_eu.sql). Same body as
-- 20260923044546_admin_leads_mirror_and_student_region_eu.sql's version otherwise.

-- Return type is changing (a new trailing column), so the old signature has to be dropped first.
DROP FUNCTION public.admin_get_student_detail(uuid);

CREATE FUNCTION public.admin_get_student_detail(p_user_id uuid)
RETURNS TABLE(
  id uuid, display_name text, email text, avatar_url text, country text, is_premium boolean,
  created_at timestamp with time zone, pending_deletion_at timestamp with time zone,
  current_streak integer, longest_streak integer, last_active_date date, retention_rate numeric,
  study_track text, enabled_levels text[], new_kanji_per_day integer, new_vocab_per_day integer,
  new_hiragana_per_day integer, new_katakana_per_day integer, max_reviews_per_day integer,
  extended_romaji_enabled boolean, kana_practice_enabled boolean, timezone text,
  timezone_preference_enabled boolean, region text, premium_until timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    u.id, u.display_name, u.email, u.avatar_url, u.country, u.is_premium, u.created_at,
    u.pending_deletion_at,
    streaks.current_streak, streaks.longest_streak, ls.last_active_date,
    public.admin_retention_rate(p_user_id, 30),
    s.study_track, s.enabled_levels, s.new_kanji_per_day, s.new_vocab_per_day,
    s.new_hiragana_per_day, s.new_katakana_per_day, s.max_reviews_per_day,
    s.extended_romaji_enabled, s.kana_practice_enabled, s.timezone, s.timezone_preference_enabled,
    u.region, u.premium_until
  from (
    -- Explicit column list, not `SELECT *` -- see 20260923044546_admin_leads_mirror_and_student_region_eu.sql.
    select id, display_name, email, avatar_url, country, is_premium, premium_until, created_at,
           pending_deletion_at, 'eu'::text as region from public.users
    union all
    select id, display_name, email, avatar_url, country, is_premium, premium_until, created_at,
           pending_deletion_at, 'us'::text as region from mirror_us.users
  ) u
  left join admin_all.leaderboard_stats ls on ls.user_id = u.id
  left join admin_all.user_study_settings s on s.user_id = u.id
  cross join lateral public.admin_get_student_streaks(p_user_id) streaks
  where u.id = p_user_id and public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_detail(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
