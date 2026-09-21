-- Run this manually in DBeaver or the Supabase SQL editor (after 20260819_leaderboard_alltime_materialized.sql).
-- Wrapped in a transaction so it's all-or-nothing against production.
--
begin;
--
-- Replaces the mv_leaderboard_*_alltime / mv_leaderboard_streak materialized views + the
-- 5-minute pg_cron refresh (20260819_leaderboard_alltime_materialized.sql) with a single
-- incrementally-maintained table, leaderboard_stats: one row per user, updated by triggers
-- at the moment a review/undo/new-card event happens, not recomputed from the full history
-- on a timer.
--
-- Why: the materialized views were a snapshot of an aggregation over *all* of review_logs /
-- user_*_progress, rebuilt from scratch every 5 minutes regardless of how much changed. That
-- meant (a) a brand-new user was invisible in Streak/All-time until the next tick, and
-- (b) refreshing more often to shrink that window would mean re-scanning the entire history
-- more often too -- the fix for "new users show up late" would have made the underlying
-- cost problem worse, not better. Maintaining one small row per user instead of replaying
-- the full event log turns "how fresh is the leaderboard" into "how fresh is a single row",
-- which is exact the instant the triggering event commits -- no batch job, no staleness
-- window, no coupling between an unrelated user's signup and a full-table scan.
--
-- Streak still needs to visibly *drop to 0* if a user simply stops reviewing (no event fires
-- when a day passes with no activity) -- that's handled by storing last_active_date and the
-- run-length as of that day, then deciding at *read* time whether last_active_date is today
-- (mirrors the old mv_leaderboard_streak's `run_end = current_date` condition exactly -- same
-- displayed behavior, just computed live off one row instead of a nightly-ish batch).
--
-- Undo is the one path left as a live single-user recompute (via the existing
-- get_review_streak(), 20260819_review_streak_set_based.sql) rather than incremental math --
-- reversing an arbitrary past review out of a streak can break a run anywhere in the middle,
-- and undo is rare (interactive, one row at a time), so a cheap indexed per-user recompute is
-- simpler and safer than trying to thread that logic through incrementally.

-- 1. The stats table. One row per user; every column is a running total maintained by the
-- triggers below. RLS enabled with no policies -- like morphology_rules, this is only ever
-- read/written by the table owner (via SECURITY DEFINER functions and these triggers), never
-- queried directly by anon/authenticated.

create table public.leaderboard_stats (
  user_id uuid primary key references public.users(id) on delete cascade,
  reviews_count bigint not null default 0,
  new_cards_count bigint not null default 0,
  xp_points bigint not null default 0,
  current_streak integer not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);
alter table public.leaderboard_stats enable row level security;

-- 2. Backfill existing users from current history, using the same gaps-and-islands technique
-- as get_review_streak() to compute each user's current_streak/last_active_date.

insert into public.leaderboard_stats (user_id, reviews_count, xp_points, new_cards_count, current_streak, last_active_date)
with review_totals as (
  select user_id, count(*) as reviews_count, sum(case when correct then 10 else 2 end) as xp_from_reviews
  from public.review_logs
  where undone = false
  group by user_id
),
new_card_totals as (
  select user_id, count(*) as new_cards_count
  from (
    select user_id from public.user_kanji_meaning_progress
    union all
    select user_id from public.user_vocabulary_progress
  ) np
  group by user_id
),
active_days as (
  select distinct user_id, reviewed_at::date as d
  from public.review_logs
  where undone = false
),
grp as (
  select user_id, d, d - (row_number() over (partition by user_id order by d))::integer as grp
  from active_days
),
runs as (
  select user_id, max(d) as run_end, count(*) as run_len
  from grp
  group by user_id, grp
),
latest_run as (
  select distinct on (user_id) user_id, run_end as last_active_date, run_len as current_streak
  from runs
  order by user_id, run_end desc
)
select
  u.id,
  coalesce(rt.reviews_count, 0),
  coalesce(rt.xp_from_reviews, 0) + coalesce(nct.new_cards_count, 0) * 25,
  coalesce(nct.new_cards_count, 0),
  coalesce(lr.current_streak, 0),
  lr.last_active_date
from public.users u
left join review_totals rt on rt.user_id = u.id
left join new_card_totals nct on nct.user_id = u.id
left join latest_run lr on lr.user_id = u.id
on conflict (user_id) do nothing;

-- 3. Give every new user a zero row the instant they sign up -- same transaction as their
-- public.users / user_study_settings rows, so it can never lag behind.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data->>'full_name', 'User Nou'), 50),
    new.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_study_settings (user_id)
  VALUES (new.id);

  INSERT INTO public.leaderboard_stats (user_id)
  VALUES (new.id);

  RETURN new;
END;
$function$;

-- 4. Reviews: increment counts and roll the streak forward on every new (non-undone) review.
-- `on conflict ... do update` both upserts a missing row (defensive -- should never happen
-- since every user gets one at signup) and takes the per-user row lock that makes concurrent
-- reviews for the same user serialize safely, in one atomic statement.
--
-- current_streak only changes when this review's day is *newer* than the stored
-- last_active_date: a second review the same day is a no-op for the streak (already counted),
-- and a review logged for an earlier day (backfilled/out-of-order) shouldn't disturb the
-- streak computed from the latest day.

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
  return new;
end;
$function$;

create trigger leaderboard_stats_review_insert_trigger
after insert on public.review_logs
for each row
when (new.undone = false)
execute function public.leaderboard_stats_on_review_insert();

-- 5. Undo: decrement the simple counters directly, but recompute the streak live for just
-- this one user (see header) rather than trying to reverse the roll-forward math.

create or replace function public.leaderboard_stats_on_review_undo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.leaderboard_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - case when old.correct then 10 else 2 end, 0),
      current_streak = coalesce(public.get_review_streak(old.user_id), 0),
      last_active_date = (
        select max(reviewed_at::date) from public.review_logs
        where user_id = old.user_id and undone = false
      ),
      updated_at = now()
  where user_id = old.user_id;
  return new;
end;
$function$;

create trigger leaderboard_stats_review_undo_trigger
after update of undone on public.review_logs
for each row
when (old.undone = false and new.undone = true)
execute function public.leaderboard_stats_on_review_undo();

-- 6. New cards: kanji-meaning and vocabulary progress rows are what mv_leaderboard_new_cards_
-- alltime counted (kanji_reading progress was deliberately excluded there too) -- same shape
-- here, +25 xp each, matching get_leaderboard_xp's new_card_points.

create or replace function public.leaderboard_stats_on_new_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.leaderboard_stats as ls (user_id, new_cards_count, xp_points)
  values (new.user_id, 1, 25)
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      updated_at = now();
  return new;
end;
$function$;

create trigger leaderboard_stats_new_kanji_trigger
after insert on public.user_kanji_meaning_progress
for each row execute function public.leaderboard_stats_on_new_card();

create trigger leaderboard_stats_new_vocab_trigger
after insert on public.user_vocabulary_progress
for each row execute function public.leaderboard_stats_on_new_card();

-- 7. Point the "all-time" branch of each RPC at leaderboard_stats instead of its materialized
-- view. Same shape as the existing windowed (p_period_start is not null) branch just below
-- each of these -- a `raw` CTE joined to users, masked by viewer identity -- except the score
-- now comes from an indexed one-row-per-user lookup instead of a live aggregation, so both
-- branches are cheap now and there's no reason for them to be structured differently.

create or replace function public.get_leaderboard_reviews(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_period_start is null then
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
          and r.reviewed_at >= p_period_start
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
$$;

create or replace function public.get_leaderboard_new_cards(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_period_start is null then
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
          and np.created_at >= p_period_start
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
$$;

create or replace function public.get_leaderboard_xp(
  p_period_start timestamptz,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_period_start is null then
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
          and reviewed_at >= p_period_start
        group by user_id
      ),
      new_card_points as (
        select user_id, count(*) * 25 as points
        from (
          select user_id, created_at from public.user_kanji_meaning_progress
          union all
          select user_id, created_at from public.user_vocabulary_progress
        ) np
        where np.created_at >= p_period_start
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
$$;

-- Streak has no period param -- it's always effectively all-time -- so this is a straight
-- read from leaderboard_stats, no live branch needed. `last_active_date = current_date` is
-- the exact same condition the old mv used (`run_end = current_date`): a streak only counts
-- if today is part of it, otherwise it reads as 0 until the user reviews again today.

create or replace function public.get_leaderboard_streak(
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable
security definer
set search_path = public
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
        case when ls.last_active_date = current_date then coalesce(ls.current_streak, 0) else 0 end::bigint as score
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

-- 8. Retire the now-unused cron job and materialized views -- the RPC functions above no
-- longer reference them, and leaving the job running would just burn a full-table scan every
-- 5 minutes for nothing.

select cron.unschedule('refresh-leaderboard-alltime-views')
where exists (select 1 from cron.job where jobname = 'refresh-leaderboard-alltime-views');

drop materialized view if exists public.mv_leaderboard_reviews_alltime;
drop materialized view if exists public.mv_leaderboard_new_cards_alltime;
drop materialized view if exists public.mv_leaderboard_xp_alltime;
drop materialized view if exists public.mv_leaderboard_streak;

commit;
