-- Run this manually in DBeaver or the Supabase SQL editor.
-- Depends on 20260903_leaderboard_timezone_and_activity_streak.sql (public.study_day,
-- public.leaderboard_bump_streak) and 20261109_reading_test_submit_answer_first_write_wins.sql
-- (public.user_reading_test_progress: one row per user+sentence, first answer wins, so this
-- fires at most once per sentence per user).
--
-- The reading test was the one study activity that moved neither the streak nor XP: answering a
-- sentence only ever wrote to user_reading_test_progress, which get_streak_active_days /
-- get_review_activity never read, and no trigger on that table ever touched leaderboard_stats.
-- A user who spent a whole session on nothing but the reading test saw their streak break the
-- next day and their XP unchanged, despite clearly having studied.
--
-- Decided values: 25 XP for a correct sentence, 2 XP for a wrong one (same floor wrong reviews
-- already get), and any answer -- right or wrong -- counts as today's streak day, the same
-- "did you show up" bar review_logs/new cards/drilling already use. Whether the test itself is
-- ever finished is irrelevant; each sentence is graded independently as soon as it's answered.

-- 1. Streak: a reading-test answer is now an activity day, same as a graded review, a new card,
--    a kana rule card, or a drill answer. -----------------------------------------------------

create or replace function public.get_streak_active_days(p_user_id uuid, p_timezone text default 'UTC')
returns table (d date)
language sql
stable
as $$
  select distinct public.study_day(a.at, p_timezone) as d from (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select attempted_at from public.user_reading_test_progress where user_id = p_user_id
  ) a;
$$;

create or replace function public.get_review_activity(
  p_user_id uuid,
  p_timezone text,
  p_days integer default 7
)
returns table (
  day date,
  has_activity boolean
)
language sql
stable
as $$
  with days as (
    select generate_series(
      public.study_day(now(), p_timezone) - (p_days - 1),
      public.study_day(now(), p_timezone),
      interval '1 day'
    )::date as day
  ),
  activity_at as (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select attempted_at from public.user_reading_test_progress where user_id = p_user_id
  )
  select
    d.day,
    exists (
      select 1 from activity_at a
      where public.study_day(a.at, p_timezone) = d.day
    ) as has_activity
  from days d
  order by d.day asc;
$$;

-- 2. XP: 25 for a correct sentence, 2 for a wrong one -- same shape as
--    leaderboard_stats_on_review_insert, but keyed off user_reading_test_progress instead of
--    review_logs, and deliberately leaves reviews_count/new_cards_count untouched (a reading-test
--    answer is neither a graded review nor a new card). --------------------------------------

create or replace function public.leaderboard_stats_on_reading_test()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 25 else 2 end;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.attempted_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, current_streak, longest_streak, last_active_date)
  values (new.user_id, v_xp, 1, 1, v_day)
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points)
  values (new.user_id, v_day, v_xp)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

drop trigger if exists leaderboard_stats_reading_test_trigger on public.user_reading_test_progress;
create trigger leaderboard_stats_reading_test_trigger
  after insert on public.user_reading_test_progress
  for each row execute function public.leaderboard_stats_on_reading_test();
