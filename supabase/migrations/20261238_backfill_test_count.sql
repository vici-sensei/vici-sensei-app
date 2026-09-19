-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Approximates test_count (20261237_test_count_on_leaderboard_stats.sql) for reading-test
-- activity that happened before that counter existed, from user_reading_test_progress -- one row
-- per (user_id, sentence_id), last write wins. Retries aren't reconstructed: a sentence answered
-- wrong and later retried only leaves its final answer behind (reading_test_retry_wrong deletes
-- the wrong row so it can be answered again), so this undercounts exactly those cases -- an
-- accepted approximation, not the exact retry-inclusive count test_count captures going forward.
--
-- Uses greatest(existing, approximated) rather than overwriting, so it can never clobber a real
-- count the live trigger (leaderboard_stats_on_reading_test) has already recorded since deploying
-- -- only fills in what was still sitting at the column's default of 0. Safe to rerun.

insert into public.leaderboard_stats (user_id, test_count)
select user_id, count(*)
from public.user_reading_test_progress
group by user_id
on conflict (user_id) do update
set test_count = greatest(public.leaderboard_stats.test_count, excluded.test_count);

insert into public.leaderboard_daily_stats (user_id, day, test_count)
select
  p.user_id,
  public.study_day(p.attempted_at, coalesce(uss.timezone, 'UTC')),
  count(*)
from public.user_reading_test_progress p
left join public.user_study_settings uss on uss.user_id = p.user_id
group by p.user_id, public.study_day(p.attempted_at, coalesce(uss.timezone, 'UTC'))
on conflict (user_id, day) do update
set test_count = greatest(public.leaderboard_daily_stats.test_count, excluded.test_count);
