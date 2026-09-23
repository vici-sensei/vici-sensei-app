-- Scope: EU-new + US-new BOTH, identical text (same as 20260922200735, which this replaces).
--
-- Closes a window of up to ~5 minutes in which an account that just entered pending deletion
-- (delete-account grace period, or retired by a region move -- both set pending_deletion_at) kept
-- showing on the leaderboard of its OWN region. The local "raw" CTE drops it immediately, but its
-- row stays in this project's own lb_export.<region>_entries cache until the next
-- lb-export-refresh run, and the "peer" CTE only excluded user_ids present in the already-filtered
-- local result -- so the stale cached row came back in through "peer" with its old score.
--
-- "peer" now excludes every user_id that exists locally at all, active or not: a local account is
-- always ranked (or hidden) by the live local computation, never by an export cache. Safe because
-- the two projects never share a user id -- a region move creates the target account through
-- GoTrue's admin API, which mints a new id (checked live before applying: no id from either
-- lb_export table exists in the other project's public.users).
--
-- Not covered (self-heals within one refresh cycle, accepted): right after a region move, the OTHER
-- region briefly shows both the new account and the old one's not-yet-refreshed export row, since
-- the two have different ids.

CREATE OR REPLACE FUNCTION public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
      peer as (
        select e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium, e.xp_all_time as score
        from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
        where e.user_id not in (select id from public.users)
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from (select * from scored union all select * from peer) combined
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
      peer as (
        select
          e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium,
          case p_period
            when 'daily' then e.xp_daily when 'weekly' then e.xp_weekly
            when 'monthly' then e.xp_monthly when 'yearly' then e.xp_yearly
          end as score
        from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
        where e.user_id not in (select id from public.users)
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from (select * from scored union all select * from peer) combined
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
      peer as (
        select e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium, e.reviews_all_time as score
        from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
        where e.user_id not in (select id from public.users)
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from (select * from scored union all select * from peer) combined
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  else
    return query
      with period_totals as (
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
      peer as (
        select
          e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium,
          case p_period
            when 'daily' then e.reviews_daily when 'weekly' then e.reviews_weekly
            when 'monthly' then e.reviews_monthly when 'yearly' then e.reviews_yearly
          end as score
        from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
        where e.user_id not in (select id from public.users)
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from (select * from scored union all select * from peer) combined
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
      peer as (
        select e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium, e.new_cards_all_time as score
        from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
        where e.user_id not in (select id from public.users)
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from (select * from scored union all select * from peer) combined
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  else
    return query
      with period_totals as (
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
      peer as (
        select
          e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium,
          case p_period
            when 'daily' then e.new_cards_daily when 'weekly' then e.new_cards_weekly
            when 'monthly' then e.new_cards_monthly when 'yearly' then e.new_cards_yearly
          end as score
        from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
        where e.user_id not in (select id from public.users)
      ),
      ranked as (
        select *, rank() over (order by score desc) as rank
        from (select * from scored union all select * from peer) combined
      )
      select * from ranked
      where rank <= p_limit or user_id = p_viewer_id
      order by rank asc;
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid) RETURNS TABLE(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    peer as (
      select
        e.user_id, e.display_name, e.avatar_url, e.country, e.is_premium,
        public.streak_display_count(
          e.current_streak, e.last_active_date, e.streak_recent_inactive,
          public.study_day(now(), e.timezone)
        )::bigint as score
      from (select * from lb_export.eu_entries union all select * from lb_export.us_entries) e
      where e.user_id not in (select id from public.users)
    ),
    ranked as (
      select *, rank() over (order by score desc) as rank
      from (select * from scored union all select * from peer) combined
    )
    select * from ranked
    where rank <= p_limit or user_id = p_viewer_id
    order by rank asc;
end;
$$;
