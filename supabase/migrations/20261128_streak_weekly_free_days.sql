-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds "free days" to the streak: a user can go inactive on up to 2 days within any trailing
-- 7-day window without breaking their streak. This is IN ADDITION to (not a replacement for)
-- the existing 1-day grace from 20261006_streak_grace_period_before_today_ends.sql, which just
-- keeps yesterday's number on screen while today's study day is still in progress -- that
-- mechanism is untouched and stays completely separate. This migration only changes what
-- happens once a day has fully elapsed with no activity at all.
--
-- Design, as decided:
--   - Window: a trailing 7-day window (today and the 6 days before it), not a fixed
--     Monday-Sunday calendar week. A fixed calendar week has an exploitable corner -- 2 free
--     days spent on Sat+Sun of one week plus 2 more on Mon+Tue of the next would forgive 4
--     consecutive absent days just because they straddle a reset boundary. A rolling window
--     has no such seam: at most 2 of ANY 7 consecutive days can be inactive, full stop.
--   - The 2 free days are consumed automatically and silently -- no user action, no
--     notification, identical to how the existing 1-day grace already works.
--   - The displayed streak NUMBER only counts actual active days -- it holds steady through a
--     free day and only increases again the next time the user actually studies (not a
--     Duolingo-style "streak freeze" that keeps counting through the frozen day).
--   - Applies uniformly: same rule, same number, on the dashboard AND the leaderboard -- no
--     premium gating, no admin toggle.
--   - Retroactive: existing users' streaks are recomputed once (step 6 below) from their real
--     activity history under the new rule, so a streak that looks broken today but only ever
--     had isolated 1-2 day gaps comes back to life.
--
-- Two implementations of the same rule, for two very different call patterns:
--   1. get_streak_run -- a from-scratch walk over a user's *entire* activity history. Used only
--      where that cost is acceptable: a single dashboard load (get_review_streak,
--      get_review_activity), the rare review-undo repair, and this migration's one-time
--      backfill. Never called per-row across many users.
--   2. leaderboard_bump_streak / streak_display_count -- O(1)-ish, working off a small bit of
--      state persisted on leaderboard_stats (current_streak, last_active_date, and now
--      streak_recent_inactive: the handful of still-in-window inactive dates from the current
--      run). Used by every activity-insert trigger (hot path -- fires on every single review)
--      and by get_leaderboard_streak, which evaluates every user on the leaderboard at once and
--      cannot afford a full history scan per row. Both loops below are bounded to at most 3
--      iterations even after a year of absence: 3 inactive days always fall within 7 days of
--      each other somewhere in the gap, so the break is detected almost immediately rather than
--      by walking the whole gap.
--
-- get_review_streak switches from "recompute from full history on every call" to "read
-- leaderboard_stats + apply the cheap check" -- both cheaper AND now structurally guaranteed to
-- agree with the leaderboard number, since they read the exact same stored state through the
-- exact same streak_display_count function. leaderboard_stats has RLS enabled with no policies
-- (see get_review_streak_record's own comment, 20260909_streak_record.sql), so this makes
-- get_review_streak security definer with an explicit auth.uid() check, same pattern
-- get_review_streak_record already uses for the same table.

-- 1. Shared constant -- the only place "2" is written down. ---------------------------------

create or replace function public.streak_free_days_per_week()
returns integer
language sql
immutable
as $$
  select 2
$$;

-- 2. Full-history recompute primitive --------------------------------------------------------
--
-- Walks every calendar day from the user's first-ever active day through p_as_of, tracking:
--   - the currently-live run's start date and its active-day count (numbering per the "flat
--     through free days" decision above -- only real active days increment it)
--   - which of that run's inactive days are still inside the trailing 7-day window
--   - the highest active_count ever reached (for longest_streak's retroactive recompute)
-- The run resets the moment a 3rd inactive day lands inside any 7-day window since it started.
-- A day before any activity ever happened, or after a break with no activity since, just does
-- nothing -- there's no run to add it to.

create or replace function public.get_streak_run(
  p_user_id uuid,
  p_timezone text,
  p_as_of date
)
returns table(active_count integer, run_start date, recent_inactive date[], max_active_count integer)
language plpgsql
stable
as $$
declare
  rec record;
  v_run_start date := null;
  v_active_count integer := 0;
  v_recent date[] := '{}';
  v_max_active_count integer := 0;
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
begin
  for rec in
    with active as (
      select d from public.get_streak_active_days(p_user_id, p_timezone) where d <= p_as_of
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
  loop
    if v_run_start is not null then
      v_recent := array(select x from unnest(v_recent) x where x > rec.day - v_window_days);
    end if;

    if rec.is_active then
      if v_run_start is null then
        v_run_start := rec.day;
        v_active_count := 1;
        v_recent := '{}';
      else
        v_active_count := v_active_count + 1;
      end if;
      v_max_active_count := greatest(v_max_active_count, v_active_count);
    else
      if v_run_start is not null then
        v_recent := v_recent || rec.day;
        if array_length(v_recent, 1) > v_free_limit then
          v_run_start := null;
          v_active_count := 0;
          v_recent := '{}';
        end if;
      end if;
    end if;
  end loop;

  active_count := v_active_count;
  run_start := v_run_start;
  recent_inactive := v_recent;
  max_active_count := v_max_active_count;
  return next;
end;
$$;

grant execute on function public.get_streak_run(uuid, text, date) to authenticated;

-- 3. Cheap read-time check ---------------------------------------------------------------------
--
-- Given the small state leaderboard_stats already carries after the last activity, decides
-- whether the streak is still alive today without rescanning history: today or yesterday is
-- always alive (the untouched 1-day grace), anything older has to walk forward from
-- last_active_date and confirm no 7-day window along the way ever collected a 3rd inactive day.
-- That walk excludes today itself -- today's own "not studied yet" status is entirely the
-- separate 1-day-grace mechanism's concern, not a free day being spent early.

create or replace function public.streak_display_count(
  p_current_streak integer,
  p_last_active_date date,
  p_recent_inactive date[],
  p_today date
)
returns integer
language plpgsql
stable
as $$
declare
  v_recent date[] := coalesce(p_recent_inactive, '{}');
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
  d date;
  v_end date;
begin
  if p_last_active_date is null then
    return 0;
  end if;
  if p_last_active_date >= p_today - 1 then
    return coalesce(p_current_streak, 0);
  end if;

  v_end := p_today - 1;
  for d in select generate_series(p_last_active_date + 1, v_end, interval '1 day')::date loop
    v_recent := array(select x from unnest(v_recent) x where x > d - v_window_days);
    v_recent := v_recent || d;
    if array_length(v_recent, 1) > v_free_limit then
      return 0;
    end if;
  end loop;

  return coalesce(p_current_streak, 0);
end;
$$;

grant execute on function public.streak_display_count(integer, date, date[], date) to authenticated;

-- 4. leaderboard_stats gains the persisted window state ---------------------------------------
--
-- Replaces the old "just compare last_active_date to a threshold" staleness check with real
-- state: the still-in-window inactive dates from the current run, so a later bump or read can
-- pick up exactly where the last write left off instead of re-deriving it.

alter table public.leaderboard_stats
  add column if not exists streak_recent_inactive date[] not null default '{}';

-- 5. Incremental bump, updated for the new rule + new state shape -----------------------------
--
-- Same role as before (leaderboard_bump_streak has computed "does this new activity continue,
-- restart, or no-op the streak" since 20260903_leaderboard_timezone_and_activity_streak.sql) but
-- the old (current_streak, last_active_date, day) -> integer shape can't express "continues, but
-- only because it's within budget" without knowing which recent days were already free. Signature
-- changes to take/return the recent_inactive array too, so every caller (all 6 activity-insert
-- triggers below) is updated together with it.

drop function if exists public.leaderboard_bump_streak(integer, date, date);

create or replace function public.leaderboard_bump_streak(
  p_current_streak integer,
  p_last_active_date date,
  p_recent_inactive date[],
  p_day date
)
returns table(streak integer, recent_inactive date[])
language plpgsql
stable
as $$
declare
  v_streak integer;
  v_recent date[] := coalesce(p_recent_inactive, '{}');
  v_free_limit constant integer := public.streak_free_days_per_week();
  v_window_days constant integer := 7;
  d date;
begin
  if p_last_active_date is null then
    streak := 1;
    recent_inactive := '{}';
    return next;
    return;
  end if;

  if p_day <= p_last_active_date then
    -- Same day (a second activity today), or a non-chronological write -- state unchanged.
    streak := coalesce(p_current_streak, 1);
    recent_inactive := v_recent;
    return next;
    return;
  end if;

  v_streak := coalesce(p_current_streak, 1);

  for d in select generate_series(p_last_active_date + 1, p_day - 1, interval '1 day')::date loop
    v_recent := array(select x from unnest(v_recent) x where x > d - v_window_days);
    v_recent := v_recent || d;
    if array_length(v_recent, 1) > v_free_limit then
      v_streak := 0;
      v_recent := '{}';
      exit;
    end if;
  end loop;

  if v_streak = 0 then
    streak := 1;
    recent_inactive := '{}';
  else
    v_recent := array(select x from unnest(v_recent) x where x > p_day - v_window_days);
    streak := v_streak + 1;
    recent_inactive := v_recent;
  end if;
  return next;
end;
$$;

-- 6. The 6 activity-insert triggers -- each now looks up its own recent_inactive state,
--    threads it through the updated leaderboard_bump_streak, and stores back both the streak
--    and the (possibly pruned/reset) array. reviews_count/xp_points/new_cards_count arithmetic
--    is untouched. -------------------------------------------------------------------------

create or replace function public.leaderboard_stats_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 10 else 2 end;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.reviewed_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, reviews_count, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, 1, v_xp, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set reviews_count = ls.reviews_count + 1,
      xp_points = ls.xp_points + v_xp,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, reviews_count, xp_points)
  values (new.user_id, v_day, 1, v_xp)
  on conflict (user_id, day) do update
  set reviews_count = lds.reviews_count + 1,
      xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

create or replace function public.leaderboard_stats_on_new_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.created_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, new_cards_count, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, 1, 25, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$function$;

create or replace function public.leaderboard_stats_on_new_rule_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.seen_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, new_cards_count, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, 1, 25, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$function$;

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
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.attempted_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, v_xp, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points)
  values (new.user_id, v_day, v_xp)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

create or replace function public.leaderboard_stats_on_practice_answer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 10 else 2 end;
  v_existing record;
  v_bump record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.practiced_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, v_xp, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points)
  values (new.user_id, v_day, v_xp)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

-- 7. Undo -- unlike an insert, a deleted review can't be "un-bumped" from the small persisted
--    state (it might uncover an earlier gap the incremental array never tracked), so this stays
--    on the full recompute, same as before -- just repairs streak_recent_inactive too now. -----

create or replace function public.leaderboard_stats_on_review_undo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when old.correct then 10 else 2 end;
  v_last_active date;
  v_run record;
begin
  select timezone into v_tz from public.user_study_settings where user_id = old.user_id;
  v_day := public.study_day(old.reviewed_at, coalesce(v_tz, 'UTC'));

  select max(d) into v_last_active
  from public.get_streak_active_days(old.user_id, coalesce(v_tz, 'UTC'));

  select * into v_run
  from public.get_streak_run(old.user_id, coalesce(v_tz, 'UTC'), v_last_active);

  update public.leaderboard_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0),
      current_streak = coalesce(v_run.active_count, 0),
      last_active_date = v_last_active,
      streak_recent_inactive = coalesce(v_run.recent_inactive, '{}'),
      updated_at = now()
  where user_id = old.user_id;

  update public.leaderboard_daily_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0)
  where user_id = old.user_id and day = v_day;

  return new;
end;
$function$;

-- 8. get_review_streak -- now a cheap read of leaderboard_stats instead of a full recompute on
--    every dashboard poll. security definer + auth.uid() check because leaderboard_stats has no
--    RLS policies of its own (same reasoning, same pattern as get_review_streak_record). --------

create or replace function public.get_review_streak(p_user_id uuid, p_timezone text default 'UTC')
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select public.streak_display_count(
       ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
       public.study_day(now(), p_timezone)
     )
     from public.leaderboard_stats ls
     where ls.user_id = p_user_id and ls.user_id = auth.uid()),
    0
  )
$$;

grant execute on function public.get_review_streak(uuid, text) to authenticated;

-- 9. get_review_activity -- gains is_free_day so the dashboard's WeekStreak strip can show a
--    protected day (shield/snowflake) instead of just an unlit flame. Stays a full recompute
--    (via get_streak_run) rather than reading the cheap stored state, because it needs the
--    live run's actual start date to tell "protected day within the current run" apart from
--    "inactive day from before the run began" -- that's not derivable from the small persisted
--    array alone. Same cost as get_review_streak used to be before step 8, so no regression.
--    Return shape changed (new column), so this needs a drop first -- grants are re-added below.

drop function if exists public.get_review_activity(uuid, text, integer);

create or replace function public.get_review_activity(
  p_user_id uuid,
  p_timezone text,
  p_days integer default 7
)
returns table (
  day date,
  has_activity boolean,
  is_free_day boolean
)
language plpgsql
stable
as $function$
declare
  v_today date := public.study_day(now(), p_timezone);
  v_run record;
  v_today_active boolean;
  v_effective_run_start date;
begin
  select * into v_run from public.get_streak_run(p_user_id, p_timezone, v_today - 1);
  select exists(
    select 1 from public.get_streak_active_days(p_user_id, p_timezone) d where d.d = v_today
  ) into v_today_active;

  v_effective_run_start := case
    when v_run.run_start is not null then v_run.run_start
    when v_today_active then v_today
    else null
  end;

  return query
  with days as (
    select generate_series(v_today - (p_days - 1), v_today, interval '1 day')::date as d
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
    union all
    select practiced_at from public.practice_logs where user_id = p_user_id
  )
  select
    days.d,
    exists(select 1 from activity_at a where public.study_day(a.at, p_timezone) = days.d),
    (
      days.d < v_today
      and v_effective_run_start is not null
      and days.d >= v_effective_run_start
      and not exists(select 1 from activity_at a where public.study_day(a.at, p_timezone) = days.d)
    )
  from days
  order by days.d asc;
end;
$function$;

grant execute on function public.get_review_activity(uuid, text, integer) to authenticated;

-- 10. get_leaderboard_streak -- same cheap check as get_review_streak (step 8), so the
--     leaderboard and the dashboard can never disagree: both are just streak_display_count
--     applied to the exact same stored row. -----------------------------------------------

create or replace function public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  return query
    with raw as (
      select
        u.id as user_id,
        u.display_name,
        u.avatar_url,
        u.country,
        u.is_premium,
        u.show_country_on_leaderboard,
        s.leaderboard_anonymous,
        la.adjective,
        la.noun,
        public.streak_display_count(
          ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
          public.study_day(now(), coalesce(s.timezone, 'UTC'))
        )::bigint as score
      from public.users u
      left join public.leaderboard_stats ls on ls.user_id = u.id
      left join public.user_study_settings s on s.user_id = u.id
      left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
      where u.pending_deletion_at is null
    ),
    viewer as (
      select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
    ),
    scored as (
      select
        user_id,
        case when viewer.is_admin then display_name
          when coalesce(leaderboard_anonymous, false)
          then coalesce(adjective || ' ' || noun, 'Anonymous Student')
          else display_name
        end as display_name,
        case when viewer.is_admin then avatar_url
          when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
        case when viewer.is_admin then country
          when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
          then null else country
        end as country,
        case when viewer.is_admin then is_premium
          when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
        score
      from raw
      cross join viewer
    ),
    ranked as (
      select *, rank() over (order by score desc) as rank
      from scored
    )
    select * from ranked
    where rank <= p_limit or user_id = p_viewer_id
    order by rank asc;
end;
$$;

grant execute on function public.get_leaderboard_streak(integer, uuid) to authenticated;

-- 11. One-time backfill -- recomputes every existing user's streak state under the new rule
--     from their real activity history via get_streak_run, so nobody is stuck on a number that
--     the old (no-forgiveness-beyond-1-day) rule produced. longest_streak only ever moves up
--     (a past record still stands even if this run's number is lower); current_streak,
--     last_active_date and streak_recent_inactive are set to the true recomputed values. -------

update public.leaderboard_stats ls
set
  current_streak = coalesce(run.active_count, 0),
  longest_streak = greatest(ls.longest_streak, coalesce(run.max_active_count, 0)),
  last_active_date = act.last_active_date,
  streak_recent_inactive = coalesce(run.recent_inactive, '{}'),
  updated_at = now()
from public.user_study_settings uss
left join lateral (
  select max(d) as last_active_date
  from public.get_streak_active_days(uss.user_id, coalesce(uss.timezone, 'UTC'))
) act on true
left join lateral public.get_streak_run(uss.user_id, coalesce(uss.timezone, 'UTC'), act.last_active_date) run on true
where uss.user_id = ls.user_id;
