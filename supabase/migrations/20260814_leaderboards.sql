-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds a global leaderboard feature: 4 ranking categories (review volume, new
-- cards learned, current streak, composite XP), each queryable over a period
-- window computed client-side (daily/weekly/monthly/yearly/all-time -- see
-- lib/leaderboard/period.ts) or with no window at all for streak.
--
-- Every other RLS policy in this schema is "own rows only" (auth.uid() =
-- user_id), so a plain `language sql stable` function running as the caller
-- would only ever see the caller's own row when aggregating across users.
-- These functions are SECURITY DEFINER to read across all users, which is why
-- each one is careful to select only id/display_name/avatar_url -- never
-- email or other sensitive columns -- since DEFINER bypasses RLS entirely.
--
-- Each function returns the top p_limit rows by score, plus the viewer's own
-- row appended (with their real rank) if it falls outside the top N, so the
-- UI can always show "your rank" even when off the podium.

alter table public.user_study_settings
  add column leaderboard_opt_out boolean not null default false;

-- Supporting indexes: unlike the existing per-user (user_id, ...) indexes,
-- these leaderboard queries aggregate across ALL users filtered by a date
-- range, which benefits from an index on the date column alone.
create index idx_review_logs_reviewed_at on public.review_logs (reviewed_at) where undone = false;
create index idx_ukmp_created_at on public.user_kanji_meaning_progress (created_at);
create index idx_uvp_created_at on public.user_vocabulary_progress (created_at);


-- DROP FUNCTION public.get_leaderboard_reviews(timestamptz, int4, uuid);

create or replace function public.get_leaderboard_reviews(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      count(r.id) as score
    from public.users u
    join public.review_logs r on r.user_id = u.id and r.undone = false
      and (p_period_start is null or r.reviewed_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
    group by u.id, u.display_name, u.avatar_url
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_reviews(timestamptz, integer, uuid) to authenticated;


-- DROP FUNCTION public.get_leaderboard_new_cards(timestamptz, int4, uuid);

create or replace function public.get_leaderboard_new_cards(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with new_progress as (
    select user_id, created_at from public.user_kanji_meaning_progress
    union all
    select user_id, created_at from public.user_vocabulary_progress
  ),
  scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      count(np.*) as score
    from public.users u
    join new_progress np on np.user_id = u.id
      and (p_period_start is null or np.created_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
    group by u.id, u.display_name, u.avatar_url
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_new_cards(timestamptz, integer, uuid) to authenticated;


-- DROP FUNCTION public.get_leaderboard_xp(timestamptz, int4, uuid);

-- Composite score: 10 XP per correct review, 2 XP per incorrect review (still
-- credits the attempt), 25 XP per new card started. Simple and transparent;
-- the weights are easy to retune later without changing the function shape.
create or replace function public.get_leaderboard_xp(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with review_points as (
    select user_id, sum(case when correct then 10 else 2 end) as points
    from public.review_logs
    where undone = false
      and (p_period_start is null or reviewed_at >= p_period_start)
    group by user_id
  ),
  new_card_points as (
    select user_id, count(*) * 25 as points
    from (
      select user_id, created_at from public.user_kanji_meaning_progress
      union all
      select user_id, created_at from public.user_vocabulary_progress
    ) np
    where p_period_start is null or np.created_at >= p_period_start
    group by user_id
  ),
  scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      coalesce(rp.points, 0) + coalesce(ncp.points, 0) as score
    from public.users u
    left join review_points rp on rp.user_id = u.id
    left join new_card_points ncp on ncp.user_id = u.id
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
      and coalesce(rp.points, 0) + coalesce(ncp.points, 0) > 0
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_xp(timestamptz, integer, uuid) to authenticated;


-- DROP FUNCTION public.get_leaderboard_streak(int4, uuid);

-- No period param -- a streak is a live "current run", not a bucketed sum.
-- Computes each user's current consecutive-day streak with a set-based
-- gaps-and-islands query (day - row_number() is constant within a run) over
-- distinct active days, keeping only runs that reach current_date. Same
-- day-granularity as get_review_streak() (20260718_query_functions.sql), just
-- evaluated for every user in one query instead of a per-user PL/pgSQL loop.
create or replace function public.get_leaderboard_streak(
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with active_days as (
    select distinct user_id, reviewed_at::date as d
    from public.review_logs
    where undone = false
  ),
  grp as (
    select user_id, d,
      d - (row_number() over (partition by user_id order by d))::integer as grp
    from active_days
  ),
  runs as (
    select user_id, max(d) as run_end, count(*) as run_len
    from grp
    group by user_id, grp
  ),
  scored as (
    select
      u.id as user_id,
      u.display_name,
      u.avatar_url,
      r.run_len as score
    from public.users u
    join runs r on r.user_id = u.id and r.run_end = current_date
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$$;

grant execute on function public.get_leaderboard_streak(integer, uuid) to authenticated;
