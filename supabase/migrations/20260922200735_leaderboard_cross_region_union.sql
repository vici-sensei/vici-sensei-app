-- Phase 5 continued. Applied identically to both new projects (see the previous migration's
-- header for why the same text works on both): every get_leaderboard_* function now unions its
-- existing (unchanged) local computation with lb_export.eu_entries + lb_export.us_entries, minus
-- whichever user_ids are already in the local result -- on the EU project that excludes all of
-- lb_export.eu_entries (it's a periodic cache of the same local users) and keeps only
-- lb_export.us_entries, and vice versa on US. No per-region branching needed in the SQL text
-- itself. Peer rows carry no admin-reveal case (the identity fields are already resolved at
-- export time -- see the previous migration) and no p_viewer_id highlighting logic beyond
-- ranking, since p_viewer_id can only ever match a LOCAL row.

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
        where e.user_id not in (select user_id from scored)
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
        where e.user_id not in (select user_id from scored)
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
        where e.user_id not in (select user_id from scored)
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
        where e.user_id not in (select user_id from scored)
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
        where e.user_id not in (select user_id from scored)
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
        where e.user_id not in (select user_id from scored)
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
      where e.user_id not in (select user_id from scored)
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
