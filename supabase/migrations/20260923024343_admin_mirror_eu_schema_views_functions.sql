-- Admin panel on US, part 1 of 2. US only. Mirror image of Phase 6's EU-only mirror_us/admin_all/
-- admin_* setup, needed now that an admin account can self-service move between regions (see
-- worker/lib/regionMove.ts -- stepSyncProfile no longer strips the `admin` flag on a move) and the
-- Teacher panel must work regardless of which project the admin's own account currently lives on.
--
-- mirror_eu.<table> is the structural twin of EU's mirror_us.<table> (1:1 copy of the one table
-- this admin surface reads from the OTHER project, LIKE ... INCLUDING DEFAULTS INCLUDING INDEXES,
-- no FK constraints, RLS enabled with zero policies -- same reasoning as
-- 20260922203458_admin_mirror_us_schema.sql, not repeated here).

CREATE SCHEMA IF NOT EXISTS mirror_eu;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'leaderboard_stats', 'leaderboard_daily_stats', 'user_study_settings',
    'review_logs', 'practice_logs', 'user_hiragana_progress', 'user_katakana_progress',
    'test_status', 'user_achievements', 'user_kanji_meaning_progress',
    'user_kanji_reading_progress', 'user_vocabulary_progress', 'user_hiragana_rule_progress',
    'user_katakana_rule_progress', 'user_reading_test_progress'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS mirror_eu.%1$I (LIKE public.%1$I INCLUDING DEFAULTS INCLUDING INDEXES)',
      t
    );
    EXECUTE format('ALTER TABLE mirror_eu.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA mirror_eu FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA mirror_eu FROM anon, authenticated;

-- admin_all.<table> = UNION ALL of the local table + its mirror -- same shape as EU's, just
-- mirror_eu instead of mirror_us. Every admin_* function below reads through these.
CREATE SCHEMA IF NOT EXISTS admin_all;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'leaderboard_stats', 'leaderboard_daily_stats', 'user_study_settings',
    'review_logs', 'practice_logs', 'user_hiragana_progress', 'user_katakana_progress',
    'test_status', 'user_achievements', 'user_kanji_meaning_progress',
    'user_kanji_reading_progress', 'user_vocabulary_progress', 'user_hiragana_rule_progress',
    'user_katakana_rule_progress', 'user_reading_test_progress'
  ]
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE VIEW admin_all.%1$I AS SELECT * FROM public.%1$I UNION ALL SELECT * FROM mirror_eu.%1$I',
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA admin_all FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA admin_all FROM anon, authenticated;

-- The 13 admin_* functions below are byte-identical to EU's (20260922203531_admin_mirror_us_functions.sql)
-- -- they only ever reference admin_all.*/public.*, never mirror_us/mirror_eu directly, so the same
-- SQL works unchanged on either project. Kept as one copy per project (rather than some shared
-- mechanism) since each project's migration history is independent, same as every other
-- multi-region migration in this repo.

CREATE OR REPLACE FUNCTION public.admin_streak_active_days(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text)
RETURNS TABLE(d date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select case when public.is_admin() then x.d else null end
  from (
    select distinct public.study_day(a.at, p_timezone) as d from (
      select reviewed_at as at from admin_all.review_logs
        where user_id = p_user_id and undone = false
      union all
      select created_at from admin_all.user_hiragana_progress where user_id = p_user_id
      union all
      select created_at from admin_all.user_katakana_progress where user_id = p_user_id
      union all
      select created_at from admin_all.user_kanji_meaning_progress where user_id = p_user_id
      union all
      select created_at from admin_all.user_vocabulary_progress where user_id = p_user_id
      union all
      select seen_at from admin_all.user_hiragana_rule_progress where user_id = p_user_id
      union all
      select seen_at from admin_all.user_katakana_rule_progress where user_id = p_user_id
      union all
      select last_drilled_at from admin_all.user_hiragana_progress
        where user_id = p_user_id and last_drilled_at is not null
      union all
      select last_drilled_at from admin_all.user_katakana_progress
        where user_id = p_user_id and last_drilled_at is not null
      union all
      select attempted_at from admin_all.user_reading_test_progress where user_id = p_user_id
      union all
      select practiced_at from admin_all.practice_logs where user_id = p_user_id
    ) a
  ) x
  where public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_streak_active_days(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_streak_run(p_user_id uuid, p_timezone text, p_as_of date)
RETURNS TABLE(active_count integer, run_start date, recent_inactive date[], max_active_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_run_start date := null;
  v_active_count integer := 0;
  v_recent date[] := '{}';
  v_max_active_count integer := 0;
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR rec IN
    with active as (
      select d from public.admin_streak_active_days(p_user_id, p_timezone) where d <= p_as_of
    ),
    bounds as (
      select min(d) as first_day from active
    ),
    days as (
      select generate_series(bounds.first_day, p_as_of, interval '1 day')::date as day
      from bounds
      where bounds.first_day is not null
    )
    select days.day, (active.d is not null) as is_active
    from days
    left join active on active.d = days.day
    order by days.day asc
  LOOP
    IF v_run_start IS NOT NULL THEN
      v_recent := array(select x from unnest(v_recent) x where x > rec.day - v_window_days);
    END IF;

    IF rec.is_active THEN
      IF v_run_start IS NULL THEN
        v_run_start := rec.day;
        v_active_count := 1;
        v_recent := '{}';
      ELSE
        v_active_count := v_active_count + 1;
      END IF;
      v_max_active_count := greatest(v_max_active_count, v_active_count);
    ELSE
      IF v_run_start IS NOT NULL THEN
        v_recent := v_recent || rec.day;
        IF array_length(v_recent, 1) > v_free_limit THEN
          v_run_start := null;
          v_active_count := 0;
          v_recent := '{}';
        END IF;
      END IF;
    END IF;
  END LOOP;

  active_count := v_active_count;
  run_start := v_run_start;
  recent_inactive := v_recent;
  max_active_count := v_max_active_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_streak_run(uuid, text, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_streak_record(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select case when not public.is_admin() then null else coalesce(max(run_len), 0) end
  from (
    with grp as (
      select d, d - (row_number() over (order by d))::integer as grp
      from public.admin_streak_active_days(p_user_id, p_timezone)
    )
    select count(*) as run_len from grp group by grp
  ) runs;
$$;

REVOKE ALL ON FUNCTION public.admin_review_streak_record(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_retention_rate(p_user_id uuid, p_window_days integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select case when not public.is_admin() then null
    when count(*) = 0 then null else avg(correct::int)::numeric end
  from admin_all.review_logs
  where user_id = p_user_id
    and undone = false
    and reviewed_at >= now() - (p_window_days || ' days')::interval;
$$;

REVOKE ALL ON FUNCTION public.admin_retention_rate(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_streaks(p_user_id uuid)
RETURNS TABLE(current_streak integer, longest_streak integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with tz as (
    select coalesce((select s.timezone from admin_all.user_study_settings s where s.user_id = p_user_id), 'UTC') as name
  )
  select
    case when not public.is_admin() then null else coalesce(
      (select public.streak_display_count(
         ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
         public.study_day(now(), (select name from tz))
       )
       from admin_all.leaderboard_stats ls
       where ls.user_id = p_user_id),
      0
    ) end,
    case when not public.is_admin() then null else public.admin_review_streak_record(p_user_id, (select name from tz)) end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_streaks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_streaks(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS TABLE(total_students bigint, new_students_7d bigint, active_today bigint, active_7d bigint, reviews_today bigint, new_leads_7d bigint, leads_uncontacted bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select
    case when not public.is_admin() then null else (select count(*) from admin_all.users where admin = false) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.users
       where admin = false and created_at >= now() - interval '7 days') end,
    case when not public.is_admin() then null else (select count(*) from admin_all.leaderboard_stats ls join admin_all.users u on u.id = ls.user_id
       where u.admin = false and ls.last_active_date = current_date) end,
    case when not public.is_admin() then null else (select count(*) from admin_all.leaderboard_stats ls join admin_all.users u on u.id = ls.user_id
       where u.admin = false and ls.last_active_date >= current_date - 6) end,
    case when not public.is_admin() then null else (select coalesce(sum(lds.reviews_count), 0) from admin_all.leaderboard_daily_stats lds join admin_all.users u on u.id = lds.user_id
       where u.admin = false and lds.day = current_date) end,
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
  where public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_roster() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_roster() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_detail(p_user_id uuid)
RETURNS TABLE(
  id uuid, display_name text, email text, avatar_url text, country text, is_premium boolean,
  created_at timestamp with time zone, pending_deletion_at timestamp with time zone,
  current_streak integer, longest_streak integer, last_active_date date, retention_rate numeric,
  study_track text, enabled_levels text[], new_kanji_per_day integer, new_vocab_per_day integer,
  new_hiragana_per_day integer, new_katakana_per_day integer, max_reviews_per_day integer,
  extended_romaji_enabled boolean, kana_practice_enabled boolean, timezone text,
  timezone_preference_enabled boolean
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
    s.extended_romaji_enabled, s.kana_practice_enabled, s.timezone, s.timezone_preference_enabled
  from admin_all.users u
  left join admin_all.leaderboard_stats ls on ls.user_id = u.id
  left join admin_all.user_study_settings s on s.user_id = u.id
  cross join lateral public.admin_get_student_streaks(p_user_id) streaks
  where u.id = p_user_id and public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_detail(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_daily_activity(p_user_id uuid)
RETURNS TABLE(day date, reviews_count integer, new_cards_count integer, learned_count integer, practice_count integer, test_count integer, xp_points integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with tz as (
    select coalesce((select timezone from admin_all.user_study_settings where user_id = p_user_id), 'UTC') as tz
  ),
  base as (
    select lds.day, lds.reviews_count, lds.new_cards_count, lds.test_count, lds.xp_points
    from admin_all.leaderboard_daily_stats lds
    where lds.user_id = p_user_id
  ),
  learned as (
    select public.study_day(g.graduated_at, (select tz from tz)) as day, count(*)::integer as learned_count
    from (
      select graduated_at from admin_all.user_hiragana_progress where user_id = p_user_id and graduated_at is not null
      union all
      select graduated_at from admin_all.user_katakana_progress where user_id = p_user_id and graduated_at is not null
    ) g
    group by 1
  ),
  practice as (
    select public.study_day(pl.practiced_at, (select tz from tz)) as day, count(*)::integer as practice_count
    from admin_all.practice_logs pl
    where pl.user_id = p_user_id
    group by 1
  ),
  days as (
    select day from base
    union select day from learned
    union select day from practice
  )
  select
    d.day,
    coalesce(b.reviews_count, 0),
    coalesce(b.new_cards_count, 0),
    coalesce(l.learned_count, 0),
    coalesce(p.practice_count, 0),
    coalesce(b.test_count, 0),
    coalesce(b.xp_points, 0)
  from days d
  left join base b on b.day = d.day
  left join learned l on l.day = d.day
  left join practice p on p.day = d.day
  where public.is_admin()
  order by d.day desc;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_daily_activity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_daily_activity(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_new_card_progress(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with tz as (
    select coalesce((select timezone from admin_all.user_study_settings where user_id = p_user_id), 'UTC') as tz
  ),
  intros as (
    select 'kanji'::text as category, k.level as level, public.study_day(p.created_at, (select tz from tz)) as day
    from admin_all.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
    union all
    select 'vocabulary', v.jlpt_level, public.study_day(p.created_at, (select tz from tz))
    from admin_all.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p.user_id = p_user_id
    union all
    select 'hiragana_reading', null, public.study_day(p.created_at, (select tz from tz))
    from admin_all.user_hiragana_progress p
    where p.user_id = p_user_id
    union all
    select 'katakana_reading', null, public.study_day(p.created_at, (select tz from tz))
    from admin_all.user_katakana_progress p
    where p.user_id = p_user_id
  ),
  history as (
    select day, category, level, count(*)::integer as n
    from intros
    group by day, category, level
  ),
  pool as (
    select 'kanji'::text as category, k.level as level, count(*)::integer as total
    from public.kanji k
    group by k.level
    union all
    select 'vocabulary', v.jlpt_level, count(*)::integer
    from public.vocabulary v
    where v.study_enabled and v.jlpt_level is not null
    group by v.jlpt_level
    union all
    select 'hiragana_reading', null, count(*)::integer
    from public.hiragana h
    where h.entry_kind != 'rule' and h.study_enabled
    union all
    select 'katakana_reading', null, count(*)::integer
    from public.katakana k
    where k.entry_kind != 'rule' and k.study_enabled
  ),
  tests as (
    select public.study_day(ts.earned_at, (select tz from tz)) as day, ts.test_type, ts.attempt_number, ts.percent
    from admin_all.test_status ts
    where ts.user_id = p_user_id and ts.test_type in ('hiragana', 'katakana')
  )
  select case when not public.is_admin() then null else jsonb_build_object(
    'timezone', (select tz from tz),
    'join_day', (select public.study_day(u.created_at, (select tz from tz)) from admin_all.users u where u.id = p_user_id),
    'today', public.study_day(now(), (select tz from tz)),
    'counter_total', (
      select coalesce(sum(lds.new_cards_count), 0)::integer
      from admin_all.leaderboard_daily_stats lds
      where lds.user_id = p_user_id
    ),
    'history', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', h.day, 'category', h.category, 'level', h.level, 'count', h.n)
                  order by h.day, h.category, h.level),
        '[]'::jsonb)
      from history h
    ),
    'pool', (
      select coalesce(
        jsonb_agg(jsonb_build_object('category', p.category, 'level', p.level, 'total', p.total)
                  order by p.category, p.level),
        '[]'::jsonb)
      from pool p
    ),
    'tests', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', t.day, 'test_type', t.test_type,
                                     'attempt_number', t.attempt_number, 'percent', t.percent)
                  order by t.day, t.attempt_number),
        '[]'::jsonb)
      from tests t
    )
  ) end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_new_card_progress(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_new_card_progress(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_test_results(p_user_id uuid)
RETURNS TABLE(id bigint, test_type text, attempt_number integer, percent integer, earned_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select ts.id, ts.test_type, ts.attempt_number, ts.percent, ts.earned_at
  from admin_all.test_status ts
  where ts.user_id = p_user_id and public.is_admin()
  order by ts.earned_at desc;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_test_results(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_test_results(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_achievements(p_user_id uuid)
RETURNS TABLE(achievement_key text, earned_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select a.achievement_key, a.earned_at
  from admin_all.user_achievements a
  where a.user_id = p_user_id and public.is_admin()
  order by a.earned_at desc;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_achievements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_achievements(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_progress_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with statuses(status) as (
    values ('new'), ('learning'), ('review'), ('relearning'), ('suspended')
  ),
  counts as (
    select 'kanji_meaning' as category, s.status, coalesce(x.cnt, 0) as cnt
    from statuses s
    left join (select status, count(*) as cnt from admin_all.user_kanji_meaning_progress where user_id = p_user_id group by status) x on x.status = s.status
    union all
    select 'kanji_reading', s.status, coalesce(x.cnt, 0)
    from statuses s
    left join (select status, count(*) as cnt from admin_all.user_kanji_reading_progress where user_id = p_user_id group by status) x on x.status = s.status
    union all
    select 'vocab_meaning', s.status, coalesce(x.cnt, 0)
    from statuses s
    left join (select status, count(*) as cnt from admin_all.user_vocabulary_progress where user_id = p_user_id group by status) x on x.status = s.status
    union all
    select 'hiragana_reading', s.status, coalesce(x.cnt, 0)
    from statuses s
    left join (select status, count(*) as cnt from admin_all.user_hiragana_progress where user_id = p_user_id group by status) x on x.status = s.status
    union all
    select 'katakana_reading', s.status, coalesce(x.cnt, 0)
    from statuses s
    left join (select status, count(*) as cnt from admin_all.user_katakana_progress where user_id = p_user_id group by status) x on x.status = s.status
  )
  select case when not public.is_admin() then null else (
    select jsonb_object_agg(category, cat_counts)
    from (
      select category, jsonb_object_agg(status, cnt) as cat_counts
      from counts
      group by category
    ) grouped
  ) end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_progress_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_progress_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_student_activity_for_day(p_user_id uuid, p_day date, p_timezone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_day_start timestamptz;
  v_day_end timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN null;
  END IF;

  SELECT day_start, day_end INTO v_day_start, v_day_end
  FROM public.study_day_range(p_day, p_timezone);

  RETURN (
    with reviews as (
      select
        'review' as kind, 'review-' || r.id as key, r.reviewed_at as at,
        coalesce(k.kanji, case when w.usually_kana then w.kana_reading
                               when w.kana_reading is not null then w.word || ' (' || w.kana_reading || ')'
                               else w.word end,
                 h.character, ka.character, r.exercise_type) as label,
        r.correct, null::integer as percent
      from admin_all.review_logs r
      left join public.kanji k on k.id = r.kanji_id
      left join public.vocabulary w on w.id = r.word_id
      left join public.hiragana h on h.id = r.hiragana_id
      left join public.katakana ka on ka.id = r.katakana_id
      where r.user_id = p_user_id and r.undone = false
        and r.reviewed_at >= v_day_start and r.reviewed_at < v_day_end
    ),
    practice as (
      select
        'practice' as kind, 'practice-' || p.id as key, p.practiced_at as at,
        coalesce(k.kanji, case when w.usually_kana then w.kana_reading
                               when w.kana_reading is not null then w.word || ' (' || w.kana_reading || ')'
                               else w.word end,
                 h.character, ka.character, p.exercise_type) as label,
        p.correct, null::integer as percent
      from admin_all.practice_logs p
      left join public.kanji k on k.id = p.kanji_id
      left join public.vocabulary w on w.id = p.word_id
      left join public.hiragana h on h.id = p.hiragana_id
      left join public.katakana ka on ka.id = p.katakana_id
      where p.user_id = p_user_id
        and p.practiced_at >= v_day_start and p.practiced_at < v_day_end
    ),
    hiragana_learned as (
      select
        'learned' as kind, 'learned-hiragana-' || g.hiragana_id as key, g.graduated_at as at,
        coalesce(h.character, 'hiragana') as label, null::boolean as correct, null::integer as percent
      from admin_all.user_hiragana_progress g
      left join public.hiragana h on h.id = g.hiragana_id
      where g.user_id = p_user_id and g.graduated_at is not null
        and g.graduated_at >= v_day_start and g.graduated_at < v_day_end
    ),
    katakana_learned as (
      select
        'learned' as kind, 'learned-katakana-' || g.katakana_id as key, g.graduated_at as at,
        coalesce(k.character, 'katakana') as label, null::boolean as correct, null::integer as percent
      from admin_all.user_katakana_progress g
      left join public.katakana k on k.id = g.katakana_id
      where g.user_id = p_user_id and g.graduated_at is not null
        and g.graduated_at >= v_day_start and g.graduated_at < v_day_end
    ),
    tests as (
      select
        'test' as kind, 'test-' || t.id as key, t.earned_at as at,
        t.test_type || ' attempt #' || t.attempt_number as label, null::boolean as correct, t.percent
      from admin_all.test_status t
      where t.user_id = p_user_id
        and t.earned_at >= v_day_start and t.earned_at < v_day_end
    ),
    entries as (
      select * from reviews
      union all select * from practice
      union all select * from hiragana_learned
      union all select * from katakana_learned
      union all select * from tests
    )
    select coalesce(
      jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'at', at, 'label', label, 'correct', correct, 'percent', percent) order by at),
      '[]'::jsonb
    )
    from entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_student_activity_for_day(uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_student_activity_for_day(uuid, date, text) TO authenticated;
