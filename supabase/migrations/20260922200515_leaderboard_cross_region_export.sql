-- Phase 5 (multi-region leaderboard). Applied identically to BOTH new projects
-- (vici-sensei-app-eu, vici-sensei-app-us) -- unlike Faza 6's admin mirror, this migration's
-- text is region-agnostic; only the pg_cron schedule set up after it (one call per project,
-- picking its own region's refresh target) differs.
--
-- Design: lb_export.eu_entries / lb_export.us_entries hold one row per user, ALREADY resolved
-- to exactly what a non-admin viewer of the public leaderboard sees today (leaderboard_anonymous
-- swaps in the alias/nulls the avatar+country/zeroes is_premium -- see get_leaderboard_xp's
-- existing CASE logic, mirrored here). Raw PII for an anonymous user never leaves its own
-- project. current_streak/last_active_date/streak_recent_inactive/timezone stay raw (not
-- identity-revealing) so the *importing* side can compute an accurate, non-stale streak with
-- streak_display_count() at query time, exactly like it already does for local users.
--
-- lb_export.<region>_entries is refreshed periodically (pg_cron, not on every write -- a
-- leaderboard doesn't need write-path-triggered precision, and this avoids adding cross-region
-- replication load to every review/practice answer) by lb_export.refresh_entries(), which
-- INSERTs into whichever of the two tables is passed in, so the function body itself is
-- identical on both projects. Each project publishes ONLY its own local table
-- (CREATE PUBLICATION ... FOR TABLE lb_export.<own>_entries) and subscribes to the peer's.
--
-- Not exposed to PostgREST: lb_export is never added to the API's exposed schema list, and no
-- grants are given to anon/authenticated -- only the SECURITY DEFINER get_leaderboard_* functions
-- (owned by the migration role) can read it.

CREATE SCHEMA IF NOT EXISTS lb_export;

CREATE TABLE IF NOT EXISTS lb_export.eu_entries (
  user_id uuid PRIMARY KEY,
  display_name text,
  avatar_url text,
  country text,
  is_premium boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  xp_daily bigint NOT NULL DEFAULT 0,
  xp_weekly bigint NOT NULL DEFAULT 0,
  xp_monthly bigint NOT NULL DEFAULT 0,
  xp_yearly bigint NOT NULL DEFAULT 0,
  xp_all_time bigint NOT NULL DEFAULT 0,
  reviews_daily bigint NOT NULL DEFAULT 0,
  reviews_weekly bigint NOT NULL DEFAULT 0,
  reviews_monthly bigint NOT NULL DEFAULT 0,
  reviews_yearly bigint NOT NULL DEFAULT 0,
  reviews_all_time bigint NOT NULL DEFAULT 0,
  new_cards_daily bigint NOT NULL DEFAULT 0,
  new_cards_weekly bigint NOT NULL DEFAULT 0,
  new_cards_monthly bigint NOT NULL DEFAULT 0,
  new_cards_yearly bigint NOT NULL DEFAULT 0,
  new_cards_all_time bigint NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  streak_recent_inactive date[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lb_export.us_entries (LIKE lb_export.eu_entries INCLUDING ALL);

-- Rebuilds lb_export.<p_target>_entries from this project's OWN local tables. Same body on
-- both projects; each project's pg_cron job (set up separately, after this migration) passes
-- its own table name ('eu_entries' on the EU project, 'us_entries' on the US one).
CREATE OR REPLACE FUNCTION lb_export.refresh_entries(p_target text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF p_target NOT IN ('eu_entries', 'us_entries') THEN
    RAISE EXCEPTION 'Unknown lb_export target %', p_target USING ERRCODE = '22023';
  END IF;

  EXECUTE format($f$
    INSERT INTO lb_export.%1$I AS t (
      user_id, display_name, avatar_url, country, is_premium, timezone,
      xp_daily, xp_weekly, xp_monthly, xp_yearly, xp_all_time,
      reviews_daily, reviews_weekly, reviews_monthly, reviews_yearly, reviews_all_time,
      new_cards_daily, new_cards_weekly, new_cards_monthly, new_cards_yearly, new_cards_all_time,
      current_streak, last_active_date, streak_recent_inactive, updated_at
    )
    SELECT
      c.user_id, c.display_name, c.avatar_url, c.country, c.is_premium, c.timezone,
      coalesce(sums.xp_daily, 0), coalesce(sums.xp_weekly, 0), coalesce(sums.xp_monthly, 0),
      coalesce(sums.xp_yearly, 0), coalesce(ls.xp_points, 0),
      coalesce(sums.reviews_daily, 0), coalesce(sums.reviews_weekly, 0), coalesce(sums.reviews_monthly, 0),
      coalesce(sums.reviews_yearly, 0), coalesce(ls.reviews_count, 0),
      coalesce(sums.new_cards_daily, 0), coalesce(sums.new_cards_weekly, 0), coalesce(sums.new_cards_monthly, 0),
      coalesce(sums.new_cards_yearly, 0), coalesce(ls.new_cards_count, 0),
      coalesce(ls.current_streak, 0), ls.last_active_date, coalesce(ls.streak_recent_inactive, '{}'), now()
    FROM (
      -- Same identity-resolution CASE logic as get_leaderboard_xp's "scored" CTE, minus the
      -- admin branch (this export is exactly what a normal public-leaderboard viewer sees).
      select
        u.id as user_id,
        case when coalesce(st.leaderboard_anonymous, false)
          then coalesce(la.adjective || ' ' || la.noun, 'Anonymous Student') else u.display_name end as display_name,
        case when coalesce(st.leaderboard_anonymous, false) then null else u.avatar_url end as avatar_url,
        case when coalesce(st.leaderboard_anonymous, false)
          or coalesce(u.show_country_on_leaderboard, true) = false then null else u.country end as country,
        case when coalesce(st.leaderboard_anonymous, false) then false else u.is_premium end as is_premium,
        coalesce(st.timezone, 'UTC') as timezone,
        public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
      from public.users u
      left join public.user_study_settings st on st.user_id = u.id
      left join public.leaderboard_aliases la on la.id = st.leaderboard_alias_id
      where u.pending_deletion_at is null
    ) c
    LEFT JOIN public.leaderboard_stats ls ON ls.user_id = c.user_id
    LEFT JOIN LATERAL (
      SELECT
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('daily', c.today)) AS xp_daily,
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('weekly', c.today)) AS xp_weekly,
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('monthly', c.today)) AS xp_monthly,
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('yearly', c.today)) AS xp_yearly,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('daily', c.today)) AS reviews_daily,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('weekly', c.today)) AS reviews_weekly,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('monthly', c.today)) AS reviews_monthly,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('yearly', c.today)) AS reviews_yearly,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('daily', c.today)) AS new_cards_daily,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('weekly', c.today)) AS new_cards_weekly,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('monthly', c.today)) AS new_cards_monthly,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('yearly', c.today)) AS new_cards_yearly
      FROM public.leaderboard_daily_stats lds
      WHERE lds.user_id = c.user_id
    ) sums ON true
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = excluded.display_name, avatar_url = excluded.avatar_url, country = excluded.country,
      is_premium = excluded.is_premium, timezone = excluded.timezone,
      xp_daily = excluded.xp_daily, xp_weekly = excluded.xp_weekly, xp_monthly = excluded.xp_monthly,
      xp_yearly = excluded.xp_yearly, xp_all_time = excluded.xp_all_time,
      reviews_daily = excluded.reviews_daily, reviews_weekly = excluded.reviews_weekly,
      reviews_monthly = excluded.reviews_monthly, reviews_yearly = excluded.reviews_yearly,
      reviews_all_time = excluded.reviews_all_time,
      new_cards_daily = excluded.new_cards_daily, new_cards_weekly = excluded.new_cards_weekly,
      new_cards_monthly = excluded.new_cards_monthly, new_cards_yearly = excluded.new_cards_yearly,
      new_cards_all_time = excluded.new_cards_all_time,
      current_streak = excluded.current_streak, last_active_date = excluded.last_active_date,
      streak_recent_inactive = excluded.streak_recent_inactive, updated_at = now();
  $f$, p_target);

  EXECUTE format(
    'DELETE FROM lb_export.%I WHERE user_id NOT IN (SELECT id FROM public.users WHERE pending_deletion_at IS NULL)',
    p_target
  );
END;
$$;

REVOKE ALL ON SCHEMA lb_export FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA lb_export FROM anon, authenticated;
