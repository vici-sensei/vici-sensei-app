-- Scope: EU-new + US-new BOTH, identical text. Apply to both inside the SAME 5-minute
-- lb-export-refresh window (right after a :x0/:x5 tick): the new column goes onto tables that are
-- logically replicated between the two projects, and a subscriber whose copy lacks a column the
-- publisher sends stops applying changes (it retries and catches up once the column exists).
--
-- Closes the two remaining ways an account could still show twice, or while pending deletion, on
-- the OTHER region's leaderboard (the own-region case was 20260923170511):
--
-- 1. Region move duplicate. The moved account gets a new user id on the target project the moment
--    the move starts (handle_new_user), while the source row stays active until the last step and
--    its lb_export row lingers until the source's next refresh. Ids can't match them up, so
--    lb_export rows now carry email_key (sha256 of the normalized email -- the plain address never
--    enters lb_export; it already crosses regions in the admin mirror anyway) and "peer" skips any
--    row whose email belongs to an ACTIVE local account. Only active ones: a retired local copy
--    must not hide the live account on the other side.
--
-- 2. Pending deletion seen from the other region. A trigger on public.users drops the row from
--    this project's own lb_export table the moment pending_deletion_at is set (delete-account or
--    region-move retirement), so the deletion replicates within seconds instead of waiting for the
--    next refresh. refresh_entries' own DELETE still catches a refresh that raced the trigger.
--
-- Left as is: right after a move, the OLD region may show nobody for that account until the target
-- region's next refresh exports the new row (at most 5 minutes; missing, never duplicated).

ALTER TABLE lb_export.eu_entries ADD COLUMN IF NOT EXISTS email_key text;
ALTER TABLE lb_export.us_entries ADD COLUMN IF NOT EXISTS email_key text;

-- Same normalization as the Worker's accounts ledger (worker/lib/region.ts emailKey: trim + lower).
CREATE OR REPLACE FUNCTION lb_export.email_key(p_email text)
RETURNS text
LANGUAGE sql STABLE STRICT
AS $$
  select encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION lb_export.refresh_entries(p_target text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF p_target NOT IN ('eu_entries', 'us_entries') THEN
    RAISE EXCEPTION 'Unknown lb_export target %', p_target USING ERRCODE = '22023';
  END IF;

  EXECUTE format($f$
    INSERT INTO lb_export.%1$I AS t (
      user_id, display_name, avatar_url, country, is_premium, timezone,
      xp_daily, xp_weekly, xp_monthly, xp_yearly, xp_all_time,
      reviews_daily, reviews_weekly, reviews_monthly, reviews_yearly, reviews_all_time,
      new_cards_daily, new_cards_weekly, new_cards_monthly, new_cards_yearly, new_cards_all_time,
      current_streak, last_active_date, streak_recent_inactive, updated_at, email_key
    )
    SELECT
      c.user_id, c.display_name, c.avatar_url, c.country, c.is_premium, c.timezone,
      coalesce(sums.xp_daily, 0), coalesce(sums.xp_weekly, 0), coalesce(sums.xp_monthly, 0),
      coalesce(sums.xp_yearly, 0), coalesce(ls.xp_points, 0),
      coalesce(sums.reviews_daily, 0), coalesce(sums.reviews_weekly, 0), coalesce(sums.reviews_monthly, 0),
      coalesce(sums.reviews_yearly, 0), coalesce(ls.reviews_count, 0),
      coalesce(sums.new_cards_daily, 0), coalesce(sums.new_cards_weekly, 0), coalesce(sums.new_cards_monthly, 0),
      coalesce(sums.new_cards_yearly, 0), coalesce(ls.new_cards_count, 0),
      coalesce(ls.current_streak, 0), ls.last_active_date, coalesce(ls.streak_recent_inactive, '{}'), now(),
      c.email_key
    FROM (
      -- Same identity-resolution CASE logic as get_leaderboard_xp's "scored" CTE, minus the
      -- admin branch (this export is exactly what a normal public-leaderboard viewer sees).
      select
        u.id as user_id,
        case when coalesce(st.leaderboard_anonymous, false)
          then coalesce(la.adjective || ' ' || la.noun, 'Anonymous Student') else u.display_name end as display_name,
        case when coalesce(st.leaderboard_anonymous, false) then null else u.avatar_url end as avatar_url,
        case when coalesce(st.leaderboard_anonymous, false)
          or coalesce(u.show_country_on_leaderboard, true) = false then null else u.country end as country,
        case when coalesce(st.leaderboard_anonymous, false) then false else u.is_premium end as is_premium,
        coalesce(st.timezone, 'UTC') as timezone,
        public.study_day(now(), coalesce(st.timezone, 'UTC')) as today,
        lb_export.email_key(u.email) as email_key
      from public.users u
      left join public.user_study_settings st on st.user_id = u.id
      left join public.leaderboard_aliases la on la.id = st.leaderboard_alias_id
      where u.pending_deletion_at is null
    ) c
    LEFT JOIN public.leaderboard_stats ls ON ls.user_id = c.user_id
    LEFT JOIN LATERAL (
      SELECT
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('daily', c.today)) AS xp_daily,
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('weekly', c.today)) AS xp_weekly,
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('monthly', c.today)) AS xp_monthly,
        sum(lds.xp_points) FILTER (WHERE lds.day >= public.leaderboard_period_start('yearly', c.today)) AS xp_yearly,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('daily', c.today)) AS reviews_daily,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('weekly', c.today)) AS reviews_weekly,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('monthly', c.today)) AS reviews_monthly,
        sum(lds.reviews_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('yearly', c.today)) AS reviews_yearly,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('daily', c.today)) AS new_cards_daily,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('weekly', c.today)) AS new_cards_weekly,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('monthly', c.today)) AS new_cards_monthly,
        sum(lds.new_cards_count) FILTER (WHERE lds.day >= public.leaderboard_period_start('yearly', c.today)) AS new_cards_yearly
      FROM public.leaderboard_daily_stats lds
      WHERE lds.user_id = c.user_id
    ) sums ON true
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = excluded.display_name, avatar_url = excluded.avatar_url, country = excluded.country,
      is_premium = excluded.is_premium, timezone = excluded.timezone,
      xp_daily = excluded.xp_daily, xp_weekly = excluded.xp_weekly, xp_monthly = excluded.xp_monthly,
      xp_yearly = excluded.xp_yearly, xp_all_time = excluded.xp_all_time,
      reviews_daily = excluded.reviews_daily, reviews_weekly = excluded.reviews_weekly,
      reviews_monthly = excluded.reviews_monthly, reviews_yearly = excluded.reviews_yearly,
      reviews_all_time = excluded.reviews_all_time,
      new_cards_daily = excluded.new_cards_daily, new_cards_weekly = excluded.new_cards_weekly,
      new_cards_monthly = excluded.new_cards_monthly, new_cards_yearly = excluded.new_cards_yearly,
      new_cards_all_time = excluded.new_cards_all_time,
      current_streak = excluded.current_streak, last_active_date = excluded.last_active_date,
      streak_recent_inactive = excluded.streak_recent_inactive, email_key = excluded.email_key,
      updated_at = now();
  $f$, p_target);

  EXECUTE format(
    'DELETE FROM lb_export.%I WHERE user_id NOT IN (SELECT id FROM public.users WHERE pending_deletion_at IS NULL)',
    p_target
  );
END;
$$;

CREATE OR REPLACE FUNCTION lb_export.drop_pending_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only this project's own table can hold a local user id; the peer one is a no-op.
  DELETE FROM lb_export.eu_entries WHERE user_id = new.id;
  DELETE FROM lb_export.us_entries WHERE user_id = new.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION lb_export.email_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION lb_export.drop_pending_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lb_export_drop_pending_user ON public.users;
CREATE TRIGGER lb_export_drop_pending_user
  AFTER UPDATE OF pending_deletion_at ON public.users
  FOR EACH ROW
  WHEN (old.pending_deletion_at IS NULL AND new.pending_deletion_at IS NOT NULL)
  EXECUTE FUNCTION lb_export.drop_pending_user();

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
          and coalesce(e.email_key, '') not in (
            select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
          and coalesce(e.email_key, '') not in (
            select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
          and coalesce(e.email_key, '') not in (
            select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
          and coalesce(e.email_key, '') not in (
            select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
          and coalesce(e.email_key, '') not in (
            select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
          and coalesce(e.email_key, '') not in (
            select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
        and coalesce(e.email_key, '') not in (
          select lb_export.email_key(email) from public.users where pending_deletion_at is null)
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
