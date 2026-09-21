-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_leaderboard_xp/reviews/new_cards's daily/weekly/monthly/yearly branches recomputed
-- period totals from review_logs and the four progress tables' created_at on every call --
-- fine at today's user count, but it scans the user's entire review history to answer "how
-- many today". leaderboard_stats already proves the fix: an incrementally-maintained counter,
-- kept current by the same triggers that write the source rows, is both live (no cron, no
-- staleness) and O(1) to read. This extends that same pattern to a per-day bucket so period
-- queries sum a handful of day-rows per active user instead of scanning every event they've
-- ever logged.

create table public.leaderboard_daily_stats (
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  reviews_count int4 not null default 0,
  new_cards_count int4 not null default 0,
  xp_points int4 not null default 0,
  constraint leaderboard_daily_stats_pkey primary key (user_id, day)
);
create index idx_leaderboard_daily_stats_day on public.leaderboard_daily_stats using btree (day);
alter table public.leaderboard_daily_stats enable row level security;
-- No policies: only the SECURITY DEFINER trigger/RPC functions below touch this table (same
-- as leaderboard_stats), so RLS-enabled-with-no-policies correctly blocks direct client reads.

-- Extend the existing triggers to also maintain the daily bucket, in the same transaction as
-- the all-time counter -- so a review is reflected in both instantly, never one without the other.

create or replace function public.leaderboard_stats_on_review_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_day date := new.reviewed_at::date;
  v_xp integer := case when new.correct then 10 else 2 end;
begin
  insert into public.leaderboard_stats as ls (user_id, reviews_count, xp_points, current_streak, last_active_date)
  values (new.user_id, 1, v_xp, 1, v_day)
  on conflict (user_id) do update
  set reviews_count = ls.reviews_count + 1,
      xp_points = ls.xp_points + v_xp,
      current_streak = case
        when ls.last_active_date is null or v_day > ls.last_active_date then
          case when v_day = ls.last_active_date + 1 then ls.current_streak + 1 else 1 end
        else ls.current_streak
      end,
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, reviews_count, xp_points)
  values (new.user_id, v_day, 1, v_xp)
  on conflict (user_id, day) do update
  set reviews_count = lds.reviews_count + 1,
      xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

create or replace function public.leaderboard_stats_on_review_undo()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_day date := old.reviewed_at::date;
  v_xp integer := case when old.correct then 10 else 2 end;
begin
  update public.leaderboard_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0),
      current_streak = coalesce(public.get_review_streak(old.user_id), 0),
      last_active_date = (
        select max(reviewed_at::date) from public.review_logs
        where user_id = old.user_id and undone = false
      ),
      updated_at = now()
  where user_id = old.user_id;

  update public.leaderboard_daily_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0)
  where user_id = old.user_id and day = v_day;

  return new;
end;
$function$;

create or replace function public.leaderboard_stats_on_new_card()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_day date := new.created_at::date;
begin
  insert into public.leaderboard_stats as ls (user_id, new_cards_count, xp_points)
  values (new.user_id, 1, 25)
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$function$;

-- One-time backfill of history the triggers above never saw (run after the trigger swap above,
-- so nothing inserted from this point on is missed or double-applied).
insert into public.leaderboard_daily_stats (user_id, day, reviews_count, xp_points)
select user_id, reviewed_at::date as day,
       count(*) as reviews_count,
       sum(case when correct then 10 else 2 end) as xp_points
from public.review_logs
where undone = false
group by user_id, reviewed_at::date
on conflict (user_id, day) do update
set reviews_count = leaderboard_daily_stats.reviews_count + excluded.reviews_count,
    xp_points = leaderboard_daily_stats.xp_points + excluded.xp_points;

insert into public.leaderboard_daily_stats (user_id, day, new_cards_count, xp_points)
select user_id, created_at::date as day, count(*) as new_cards_count, count(*) * 25 as xp_points
from (
  select user_id, created_at from public.user_kanji_meaning_progress
  union all
  select user_id, created_at from public.user_vocabulary_progress
  union all
  select user_id, created_at from public.user_hiragana_progress
  union all
  select user_id, created_at from public.user_katakana_progress
) np
group by user_id, created_at::date
on conflict (user_id, day) do update
set new_cards_count = leaderboard_daily_stats.new_cards_count + excluded.new_cards_count,
    xp_points = leaderboard_daily_stats.xp_points + excluded.xp_points;

-- Period-scoped branches of the three leaderboard RPCs now sum the daily bucket instead of
-- scanning review_logs / the four progress tables. all_time branches (the `else` half) and
-- get_leaderboard_streak are untouched -- they already read leaderboard_stats directly.

create or replace function public.get_leaderboard_reviews(p_period text, p_limit integer, p_viewer_id uuid)
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
      with period_totals as (
        select user_id, sum(reviews_count) as cnt
        from public.leaderboard_daily_stats
        where day >= v_period_start::date
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

create or replace function public.get_leaderboard_xp(p_period text, p_limit integer, p_viewer_id uuid)
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
      with period_totals as (
        select user_id, sum(xp_points) as points
        from public.leaderboard_daily_stats
        where day >= v_period_start::date
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

create or replace function public.get_leaderboard_new_cards(p_period text, p_limit integer, p_viewer_id uuid)
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
      with period_totals as (
        select user_id, sum(new_cards_count) as cnt
        from public.leaderboard_daily_stats
        where day >= v_period_start::date
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
