-- Run this manually in DBeaver or the Supabase SQL editor (after 20260814_leaderboards.sql).
--
-- The four leaderboard RPCs only surfaced users who already had a nonzero
-- score: get_leaderboard_reviews/new_cards inner-joined against activity
-- tables (no rows -> excluded entirely), get_leaderboard_xp explicitly
-- filtered out score = 0, and get_leaderboard_streak inner-joined against
-- "runs ending today" (no active streak -> excluded entirely). That hid
-- every opted-in user who hasn't studied yet. Switch the activity joins to
-- LEFT JOINs (count()/coalesce() already turn "no matching rows" into a
-- score of 0) and drop the score > 0 filter so every opted-in user appears,
-- ranked at the bottom when their score is 0.

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
    left join public.review_logs r on r.user_id = u.id and r.undone = false
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
    left join new_progress np on np.user_id = u.id
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
      coalesce(r.run_len, 0) as score
    from public.users u
    left join runs r on r.user_id = u.id and r.run_end = current_date
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
