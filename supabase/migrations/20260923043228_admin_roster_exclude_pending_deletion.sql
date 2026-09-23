-- Scope: EU-new + US-new BOTH -- admin_get_student_roster/admin_get_dashboard_stats exist
-- identically on both projects (see 20260922203531_admin_mirror_us_functions.sql for EU,
-- 20260923024343_admin_mirror_eu_schema_views_functions.sql for US), each reading its own
-- project's admin_all view.
--
-- Neither function filtered out retired accounts (public.users.pending_deletion_at set), so a
-- region move -- which retires the source-region row instead of deleting it immediately, see
-- 20260923012239_region_move_retirement.sql -- left a visible duplicate in the Teacher roster and
-- in the dashboard student counts until the 30-day grace period actually expired and
-- process-scheduled-deletions removed it. Known and accepted as cosmetic at the time (see the
-- project memory on the region-move feature); fixing it here by excluding
-- pending_deletion_at IS NOT NULL rows, same condition the leaderboard/RLS side already uses.

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS TABLE(total_students bigint, new_students_7d bigint, active_today bigint, active_7d bigint, reviews_today bigint, new_leads_7d bigint, leads_uncontacted bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    case when not public.is_admin() then null else (select count(*) from admin_all.users
       where admin = false and pending_deletion_at is null) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.users
       where admin = false and pending_deletion_at is null and created_at >= now() - interval '7 days') end,
    case when not public.is_admin() then null else (select count(*) from admin_all.leaderboard_stats ls join admin_all.users u on u.id = ls.user_id
       where u.admin = false and u.pending_deletion_at is null and ls.last_active_date = current_date) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.leaderboard_stats ls join admin_all.users u on u.id = ls.user_id
       where u.admin = false and u.pending_deletion_at is null and ls.last_active_date >= current_date - 6) end,
    case when not public.is_admin() then null else (select coalesce(sum(lds.reviews_count), 0) from admin_all.leaderboard_daily_stats lds join admin_all.users u on u.id = lds.user_id
       where u.admin = false and u.pending_deletion_at is null and lds.day = current_date) end,
    -- Leads aren't mirrored -- the marketing site's lead capture isn't region-split, so this
    -- stays exactly what get_admin_dashboard_stats already does.
    case when not public.is_admin() then null else (select count(*) from public.free_lesson_leads where created_at >= now() - interval '7 days') end,
    case when not public.is_admin() then null else (select count(*) from public.free_lesson_leads where contacted = false) end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_dashboard_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_roster()
RETURNS TABLE(id uuid, display_name text, email text, avatar_url text, country text, is_premium boolean, created_at timestamp with time zone, current_streak integer, longest_streak integer, last_active_date date, reviews_count bigint, new_cards_count bigint, learned_count bigint, practice_count bigint, test_count bigint, xp_points bigint)
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
    coalesce(ls.xp_points, 0)
  from admin_all.users u
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
