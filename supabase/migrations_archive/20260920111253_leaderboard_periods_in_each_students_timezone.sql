-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Makes the XP / reviews / new-cards leaderboards measure "daily / weekly / monthly / yearly" in
-- each student's OWN study day, the way get_leaderboard_streak already does, instead of one window
-- taken from the server's UTC clock.
--
-- Before: the period start was date_trunc('day' | 'week' | 'month' | 'year', now()) -- the UTC
-- calendar -- compared to leaderboard_daily_stats.day, which holds each student's STUDY day
-- (study_day(activity, their timezone): local time minus 6 hours). The two were never the same
-- thing: between 00:00 and 06:00 UTC the daily boards were empty for everyone (activity stored
-- under the previous study day fell before the new UTC date), and once the students' timezones
-- started being saved (20261242) the stored days moved to each student's local 6 a.m. while the
-- window stayed on UTC, widening the gap.
--
-- After: every row's window starts at its own current study day,
--   today  = study_day(now(), coalesce(that student's saved timezone, 'UTC'))
--   start  = leaderboard_period_start(period, today)   -- today / that week's Monday / first of the
--                                                       -- month / Jan 1, all of the study calendar
-- and the score is the sum of that student's leaderboard_daily_stats rows from `start` on. all_time
-- is untouched. Each student is measured on their own day, so a "daily" board mixes different
-- absolute windows -- the same choice the streak board makes.
--
-- leaderboard_period_end(period, timezone) is the matching "Resets in ..." instant for the person
-- looking at the board: the next study-day boundary (6 a.m. local, DST-correct) of the viewer's
-- own period. The client used the UTC calendar for that too (lib/leaderboard/period.ts), ignoring
-- even the 6-hour offset.
--
-- The three get_leaderboard_* functions keep their signatures and RETURNS TABLE shapes (CREATE OR
-- REPLACE), and are otherwise unchanged from the live definitions: only the period start and the
-- period_totals CTE differ. Wrapped in one transaction.

begin;

create or replace function public.leaderboard_period_start(p_period text, p_today date)
 returns date
 language sql
 immutable
as $function$
  select case p_period
    when 'daily' then p_today
    when 'weekly' then date_trunc('week', p_today::timestamp)::date
    when 'monthly' then date_trunc('month', p_today::timestamp)::date
    when 'yearly' then date_trunc('year', p_today::timestamp)::date
  end;
$function$;

create or replace function public.leaderboard_period_end(p_period text, p_timezone text default null)
 returns timestamp with time zone
 language sql
 stable
as $function$
  with tz as (
    select public.resolve_user_timezone(auth.uid(), p_timezone) as name
  ),
  today as (
    select tz.name, public.study_day(now(), tz.name) as d from tz
  )
  select case
    when p_period not in ('daily', 'weekly', 'monthly', 'yearly') then null
    else (
      (case p_period
         when 'daily' then t.d + 1
         when 'weekly' then (public.leaderboard_period_start('weekly', t.d) + 7)
         when 'monthly' then (public.leaderboard_period_start('monthly', t.d) + interval '1 month')::date
         when 'yearly' then (public.leaderboard_period_start('yearly', t.d) + interval '1 year')::date
       end)::timestamp + interval '6 hours'
    ) at time zone t.name
  end
  from today t;
$function$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  if p_period = 'all_time' then
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
          coalesce(ls.xp_points, 0) as score
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
  else
    return query
      with period_totals as (
        -- Each row's window starts at ITS OWN current study day (its saved timezone, 6 a.m.
        -- rollover, UTC when none is saved) -- the same "today" get_leaderboard_streak uses.
        select u.id as user_id, sum(lds.xp_points) as points
        from public.users u
        left join public.user_study_settings st on st.user_id = u.id
        cross join lateral (
          select public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
        ) d
        join public.leaderboard_daily_stats lds on lds.user_id = u.id
        where lds.day >= public.leaderboard_period_start(p_period, d.today)
        group by u.id
      ),
      raw as (
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
          coalesce(pt.points, 0) as score
        from public.users u
        left join period_totals pt on pt.user_id = u.id
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
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  if p_period = 'all_time' then
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
          coalesce(ls.reviews_count, 0) as score
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
  else
    return query
      with period_totals as (
        -- Each row's window starts at ITS OWN current study day (its saved timezone, 6 a.m.
        -- rollover, UTC when none is saved) -- the same "today" get_leaderboard_streak uses.
        select u.id as user_id, sum(lds.reviews_count) as cnt
        from public.users u
        left join public.user_study_settings st on st.user_id = u.id
        cross join lateral (
          select public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
        ) d
        join public.leaderboard_daily_stats lds on lds.user_id = u.id
        where lds.day >= public.leaderboard_period_start(p_period, d.today)
        group by u.id
      ),
      raw as (
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
          coalesce(pt.cnt, 0) as score
        from public.users u
        left join period_totals pt on pt.user_id = u.id
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
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  if p_period = 'all_time' then
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
          coalesce(ls.new_cards_count, 0) as score
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
  else
    return query
      with period_totals as (
        -- Each row's window starts at ITS OWN current study day (its saved timezone, 6 a.m.
        -- rollover, UTC when none is saved) -- the same "today" get_leaderboard_streak uses.
        select u.id as user_id, sum(lds.new_cards_count) as cnt
        from public.users u
        left join public.user_study_settings st on st.user_id = u.id
        cross join lateral (
          select public.study_day(now(), coalesce(st.timezone, 'UTC')) as today
        ) d
        join public.leaderboard_daily_stats lds on lds.user_id = u.id
        where lds.day >= public.leaderboard_period_start(p_period, d.today)
        group by u.id
      ),
      raw as (
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
          coalesce(pt.cnt, 0) as score
        from public.users u
        left join period_totals pt on pt.user_id = u.id
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
  end if;
end;
$function$;

commit;
