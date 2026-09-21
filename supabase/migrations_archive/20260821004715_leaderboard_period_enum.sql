-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_leaderboard_reviews/get_leaderboard_new_cards/get_leaderboard_xp took a client-computed
-- p_period_start timestamptz (lib/leaderboard/period.ts's getPeriodStart(period, new Date()),
-- even the "clock-offset-corrected" call site still sent a client value) and used it
-- unvalidated as the window boundary for a leaderboard every user sees. Replace with a
-- p_period enum; the boundary (a single shared UTC instant for everyone, per the existing
-- "one shared reset moment" design -- no per-user timezone here) is computed server-side from
-- now(). get_leaderboard_streak has no period param -- untouched.
--
-- Bodies are otherwise byte-identical to the current live definitions -- only the parameter
-- and the period-start computation change; every masking/anonymity CASE expression, join, and
-- filter is unchanged.

drop function if exists public.get_leaderboard_reviews(timestamptz, integer, uuid);

create function public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_period_start timestamptz;
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  v_period_start := case p_period
    when 'daily' then date_trunc('day', now())
    when 'weekly' then date_trunc('week', now())
    when 'monthly' then date_trunc('month', now())
    when 'yearly' then date_trunc('year', now())
    else null
  end;

  if v_period_start is null then
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
          count(r.id) as score
        from public.users u
        left join public.review_logs r on r.user_id = u.id and r.undone = false
          and r.reviewed_at >= v_period_start
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
        group by u.id, u.display_name, u.avatar_url, u.country, u.is_premium,
                 u.show_country_on_leaderboard, s.leaderboard_anonymous, la.adjective, la.noun
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

grant execute on function public.get_leaderboard_reviews(text, integer, uuid) to authenticated;

drop function if exists public.get_leaderboard_new_cards(timestamptz, integer, uuid);

create function public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_period_start timestamptz;
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  v_period_start := case p_period
    when 'daily' then date_trunc('day', now())
    when 'weekly' then date_trunc('week', now())
    when 'monthly' then date_trunc('month', now())
    when 'yearly' then date_trunc('year', now())
    else null
  end;

  if v_period_start is null then
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
      with new_progress as (
        select user_id, created_at from public.user_kanji_meaning_progress
        union all
        select user_id, created_at from public.user_vocabulary_progress
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
          count(np.*) as score
        from public.users u
        left join new_progress np on np.user_id = u.id
          and np.created_at >= v_period_start
        left join public.user_study_settings s on s.user_id = u.id
        left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
        where u.pending_deletion_at is null
        group by u.id, u.display_name, u.avatar_url, u.country, u.is_premium,
                 u.show_country_on_leaderboard, s.leaderboard_anonymous, la.adjective, la.noun
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

grant execute on function public.get_leaderboard_new_cards(text, integer, uuid) to authenticated;

drop function if exists public.get_leaderboard_xp(timestamptz, integer, uuid);

create function public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_period_start timestamptz;
begin
  if p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all_time') then
    raise exception 'Invalid p_period %', p_period using errcode = '22023';
  end if;

  v_period_start := case p_period
    when 'daily' then date_trunc('day', now())
    when 'weekly' then date_trunc('week', now())
    when 'monthly' then date_trunc('month', now())
    when 'yearly' then date_trunc('year', now())
    else null
  end;

  if v_period_start is null then
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
      with review_points as (
        select user_id, sum(case when correct then 10 else 2 end) as points
        from public.review_logs
        where undone = false
          and reviewed_at >= v_period_start
        group by user_id
      ),
      new_card_points as (
        select user_id, count(*) * 25 as points
        from (
          select user_id, created_at from public.user_kanji_meaning_progress
          union all
          select user_id, created_at from public.user_vocabulary_progress
        ) np
        where np.created_at >= v_period_start
        group by user_id
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
          coalesce(rp.points, 0) + coalesce(ncp.points, 0) as score
        from public.users u
        left join review_points rp on rp.user_id = u.id
        left join new_card_points ncp on ncp.user_id = u.id
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

grant execute on function public.get_leaderboard_xp(text, integer, uuid) to authenticated;
