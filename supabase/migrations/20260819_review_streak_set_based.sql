-- Run this manually in DBeaver or the Supabase SQL editor (after 20260718_query_functions.sql).
--
-- Replaces the per-day PL/pgSQL loop in get_review_streak (function 4 in
-- 20260718_query_functions.sql -- one `select exists(...)` per day of the streak, walking
-- backwards from today) with a single set-based query. Called on every 10-30s stats poll
-- (lib/data/studyStats.ts's getStudyStats), so the old loop's cost scaled with streak length
-- (O(streak) index probes per call); this is a single scan + aggregation regardless of streak
-- length.
--
-- Same gaps-and-islands technique as get_leaderboard_streak (20260814_leaderboards.sql), just
-- for one user instead of every user at once: `d - row_number() over (order by d)` is constant
-- within a run of consecutive dates, so grouping by that difference isolates each run without
-- walking day-by-day. The run whose max day is today is the current streak; if there's no
-- activity today, no run ends today and the result is 0 -- matching the old loop, whose first
-- iteration (checking today) would immediately fail the same way.
--
-- Same day-granularity as before (reviewed_at::date, i.e. server/UTC day boundaries, not the
-- user's local timezone) -- get_review_activity's header (20260808_review_activity_rpc.sql)
-- explains why that's left as-is here too, rather than switched to the timezone-aware
-- convention: changing it would change the streak number itself, which is a separate decision
-- from this performance rewrite.
--
-- Verified via EXPLAIN ANALYZE against the linked project (both plans are trivial on today's
-- empty review_logs, as expected) and against a synthetic multi-user, multi-gap dataset
-- confirming this produces the same results as the old loop.

create or replace function public.get_review_streak(p_user_id uuid)
returns integer
language sql
stable
as $$
  with active_days as (
    select distinct reviewed_at::date as d
    from public.review_logs
    where user_id = p_user_id
      and undone = false
      and reviewed_at::date <= current_date
  ),
  grp as (
    select d, d - (row_number() over (order by d))::integer as grp
    from active_days
  ),
  runs as (
    select max(d) as run_end, count(*) as run_len
    from grp
    group by grp
  )
  select coalesce((select run_len from runs where run_end = current_date), 0);
$$;

grant execute on function public.get_review_streak(uuid) to authenticated;
