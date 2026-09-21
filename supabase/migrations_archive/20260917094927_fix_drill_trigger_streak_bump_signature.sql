-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes a bug left by 20261128_streak_weekly_free_days.sql: that migration changed
-- leaderboard_bump_streak's signature from (integer, date, date) to
-- (integer, date, date, date[]) and dropped the old 3-arg overload, then updated 5 of the 6
-- activity-insert trigger functions to match ("every caller (all 6 activity-insert triggers
-- below)" -- but only 5 were actually redefined). The missed one was
-- leaderboard_stats_on_drill() (20260903_drill_counts_toward_streak.sql), which fires on every
-- hiragana/katakana drill answer via leaderboard_stats_hiragana_drill_trigger /
-- leaderboard_stats_katakana_drill_trigger. Since the 3-arg overload it still called no longer
-- exists, every drill answer has been failing with "function
-- public.leaderboard_bump_streak(integer, date, date) does not exist" since 20261128 was applied.
--
-- Brings this function to the same shape as the other 5: thread streak_recent_inactive through
-- the 4-arg leaderboard_bump_streak and store back both the streak and the array. No XP/
-- reviews_count/new_cards_count involved here, same as before -- drilling still doesn't earn XP
-- or count as a new card.

create or replace function public.leaderboard_stats_on_drill()
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
  v_day := public.study_day(new.last_drilled_at, coalesce(v_tz, 'UTC'));

  select current_streak, last_active_date, streak_recent_inactive
    into v_existing
    from public.leaderboard_stats where user_id = new.user_id;

  select * into v_bump from public.leaderboard_bump_streak(
    v_existing.current_streak, v_existing.last_active_date, v_existing.streak_recent_inactive, v_day
  );

  insert into public.leaderboard_stats as ls
    (user_id, current_streak, longest_streak, last_active_date, streak_recent_inactive)
  values (new.user_id, coalesce(v_bump.streak, 1), coalesce(v_bump.streak, 1), v_day, coalesce(v_bump.recent_inactive, '{}'))
  on conflict (user_id) do update
  set current_streak = v_bump.streak,
      longest_streak = greatest(ls.longest_streak, v_bump.streak),
      last_active_date = greatest(ls.last_active_date, v_day),
      streak_recent_inactive = v_bump.recent_inactive,
      updated_at = now();

  return new;
end;
$function$;
