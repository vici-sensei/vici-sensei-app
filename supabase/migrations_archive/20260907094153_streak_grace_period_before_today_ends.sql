-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes the dashboard's "Day streak" card (and the leaderboard's streak column) reading 0 the
-- moment a new study day starts, even though the user hasn't broken anything yet -- they just
-- haven't reviewed a card *today* (today's study_day, per study_day_bounds' existing 6AM local
-- boundary -- 20260903_study_day_6am_boundary.sql) yet. Both get_review_streak and
-- get_leaderboard_streak only showed a nonzero number when the user's most recent active day was
-- exactly today, so e.g. a 10-day streak with nothing studied yet this study-day flashed to 0
-- and back to 11 the instant the first card of the day was reviewed.
--
-- Fix: both now also accept "most recent active day was yesterday" as still-alive -- so the
-- number holds at yesterday's run length through the rest of today's study day, then either
-- grows by one (once today gets its own activity) or finally drops to 0 (if today's study day
-- ends with still nothing done). Any gap of 2+ days is unchanged -- still 0.
--
-- get_review_streak_record ("Best streak") is untouched -- it was never "must end today" to
-- begin with (it's the longest run in history, open-ended), so it already behaved correctly.

create or replace function public.get_review_streak(p_user_id uuid, p_timezone text default 'UTC')
returns integer
language sql
stable
as $$
  with active_days as (
    select d from public.get_streak_active_days(p_user_id, p_timezone)
    where d <= public.study_day(now(), p_timezone)
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
  -- Today's run first (already studied today); otherwise yesterday's run, still within grace
  -- until today's study day ends; otherwise the streak is actually broken.
  select coalesce(
    (select run_len from runs where run_end = public.study_day(now(), p_timezone)),
    (select run_len from runs where run_end = public.study_day(now(), p_timezone) - 1),
    0
  );
$$;

grant execute on function public.get_review_streak(uuid, text) to authenticated;

-- Same grace period for the leaderboard's streak metric: leaderboard_stats.current_streak
-- already holds the run length ending at last_active_date (maintained incrementally by
-- leaderboard_bump_streak via the leaderboard_stats_on_review_insert/_on_new_card/_on_drill/
-- _on_new_rule_card triggers), so this only widens which last_active_date values still count as
-- "alive" -- no trigger or stored-column changes needed.
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
        case
          when ls.last_active_date >= public.study_day(now(), coalesce(s.timezone, 'UTC')) - 1
          then coalesce(ls.current_streak, 0)
          else 0
        end::bigint as score
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
