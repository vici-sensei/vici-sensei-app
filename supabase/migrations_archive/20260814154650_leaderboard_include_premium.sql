-- Run this manually in DBeaver or the Supabase SQL editor (after
-- 20260814_add_user_country.sql).
--
-- The leaderboard now shows a small "PRO" tag on premium users' avatars, so
-- the four leaderboard RPCs need to surface is_premium alongside the other
-- profile fields. Same as the country column added above, adding a column to
-- a `returns table(...)` signature isn't something CREATE OR REPLACE allows,
-- so each function is dropped and recreated instead.

drop function if exists public.get_leaderboard_reviews(timestamptz, integer, uuid);

create function public.get_leaderboard_reviews(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
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
      u.country,
      u.is_premium,
      count(r.id) as score
    from public.users u
    left join public.review_logs r on r.user_id = u.id and r.undone = false
      and (p_period_start is null or r.reviewed_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
    group by u.id, u.display_name, u.avatar_url, u.country, u.is_premium
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


drop function if exists public.get_leaderboard_new_cards(timestamptz, integer, uuid);

create function public.get_leaderboard_new_cards(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
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
      u.country,
      u.is_premium,
      count(np.*) as score
    from public.users u
    left join new_progress np on np.user_id = u.id
      and (p_period_start is null or np.created_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    where coalesce(s.leaderboard_opt_out, false) = false
    group by u.id, u.display_name, u.avatar_url, u.country, u.is_premium
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


drop function if exists public.get_leaderboard_xp(timestamptz, integer, uuid);

create function public.get_leaderboard_xp(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
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
      u.country,
      u.is_premium,
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


drop function if exists public.get_leaderboard_streak(integer, uuid);

create function public.get_leaderboard_streak(
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
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
      u.country,
      u.is_premium,
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
