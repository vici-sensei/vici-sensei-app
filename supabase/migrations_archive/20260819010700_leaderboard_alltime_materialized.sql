-- Run this manually in DBeaver or the Supabase SQL editor (after
-- 20260819_scheduled_account_deletion.sql and 20260819_hide_pending_deletion_from_leaderboards.sql
-- -- this migration was written directly against the live function bodies those left in place,
-- fetched via `supabase db query --linked "select pg_get_functiondef(oid) ... "` rather than
-- reconstructed from migration history, since several migrations since 20260814_leaderboards.sql
-- have reshaped these functions -- anonymity handling, admin unmasking, country/premium columns).
--
-- get_leaderboard_reviews/new_cards/xp/streak each LEFT JOIN + aggregate across every user's
-- review_logs/progress rows on every call. The *_reviews/new_cards/xp variants take a
-- p_period_start and are self-limiting even as history grows -- "this week"'s window only ever
-- contains a week's worth of rows, bounded by the existing idx_review_logs_reviewed_at index --
-- so that branch is left untouched here, byte-identical to the current live query. The
-- unbounded case is p_period_start IS NULL ("all-time"), which scans the *entire* history every
-- time and only gets more expensive as more of it accumulates, and get_leaderboard_streak,
-- which has no period at all (always effectively all-time) and does the same unbounded scan on
-- every call. Those two unbounded cases now read from a materialized view instead, refreshed by
-- pg_cron every 5 minutes (pg_cron is already enabled in this project -- see
-- 20260819_process_scheduled_deletions_cron.sql). A leaderboard rank is inherently a bit stale
-- the moment it's read anyway; being up to 5 minutes behind is an acceptable trade for turning
-- an unbounded aggregation into an index lookup.
--
-- The anonymity/admin-unmasking logic (case when viewer.is_admin ... / leaderboard_anonymous)
-- depends on *who's asking* (auth.uid()), not just the target row, so it can't be baked into
-- the materialized view for every viewer at once -- the views instead store the pre-masking
-- "raw" row (real display_name/avatar_url/country/is_premium/leaderboard_anonymous/alias, plus
-- score and rank, which are viewer-independent), and the masking CASE expressions move into the
-- functions, applied live over the already-aggregated view. That keeps the expensive part
-- (aggregating over all of review_logs/progress) precomputed while the cheap, viewer-dependent
-- part (a handful of CASE expressions over already-ranked rows) stays exact and live.
--
-- Client call sites (lib/data/leaderboard.ts) are unchanged -- same RPC names, same params.

-- 1. One materialized view per metric: the "raw" CTE from each function's current live body,
-- with p_period_start effectively null (all-time), plus rank (computed on the real score, so
-- it's unaffected by the masking that happens later in the function -- matches today's
-- behavior, where `ranked` is computed from `scored`, which still carries the real score).

create materialized view public.mv_leaderboard_reviews_alltime as
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
  count(r.id) as score,
  rank() over (order by count(r.id) desc) as rank
from public.users u
left join public.review_logs r on r.user_id = u.id and r.undone = false
left join public.user_study_settings s on s.user_id = u.id
left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
where u.pending_deletion_at is null
group by u.id, u.display_name, u.avatar_url, u.country, u.is_premium,
         u.show_country_on_leaderboard, s.leaderboard_anonymous, la.adjective, la.noun;

create unique index mv_leaderboard_reviews_alltime_user_id_idx on public.mv_leaderboard_reviews_alltime (user_id);

create materialized view public.mv_leaderboard_new_cards_alltime as
with new_progress as (
  select user_id, created_at from public.user_kanji_meaning_progress
  union all
  select user_id, created_at from public.user_vocabulary_progress
)
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
  count(np.*) as score,
  rank() over (order by count(np.*) desc) as rank
from public.users u
left join new_progress np on np.user_id = u.id
left join public.user_study_settings s on s.user_id = u.id
left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
where u.pending_deletion_at is null
group by u.id, u.display_name, u.avatar_url, u.country, u.is_premium,
         u.show_country_on_leaderboard, s.leaderboard_anonymous, la.adjective, la.noun;

create unique index mv_leaderboard_new_cards_alltime_user_id_idx on public.mv_leaderboard_new_cards_alltime (user_id);

create materialized view public.mv_leaderboard_xp_alltime as
with review_points as (
  select user_id, sum(case when correct then 10 else 2 end) as points
  from public.review_logs
  where undone = false
  group by user_id
),
new_card_points as (
  select user_id, count(*) * 25 as points
  from (
    select user_id, created_at from public.user_kanji_meaning_progress
    union all
    select user_id, created_at from public.user_vocabulary_progress
  ) np
  group by user_id
)
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
  coalesce(rp.points, 0) + coalesce(ncp.points, 0) as score,
  rank() over (order by coalesce(rp.points, 0) + coalesce(ncp.points, 0) desc) as rank
from public.users u
left join review_points rp on rp.user_id = u.id
left join new_card_points ncp on ncp.user_id = u.id
left join public.user_study_settings s on s.user_id = u.id
left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
where u.pending_deletion_at is null;

create unique index mv_leaderboard_xp_alltime_user_id_idx on public.mv_leaderboard_xp_alltime (user_id);

create materialized view public.mv_leaderboard_streak as
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
)
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
  coalesce(r.run_len, 0) as score,
  rank() over (order by coalesce(r.run_len, 0) desc) as rank
from public.users u
left join runs r on r.user_id = u.id and r.run_end = current_date
left join public.user_study_settings s on s.user_id = u.id
left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
where u.pending_deletion_at is null;

create unique index mv_leaderboard_streak_user_id_idx on public.mv_leaderboard_streak (user_id);

-- 2. Point the functions' unbounded branch at the materialized views; the windowed branch
-- (p_period_start is not null) is byte-identical to the current live query. plpgsql with an
-- explicit IF, rather than a single SQL statement relying on the planner to prune the unused
-- branch, so which branch runs is guaranteed rather than a planner-dependent hope.

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
      with viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      )
      select
        mv.user_id,
        case when viewer.is_admin then mv.display_name
          when coalesce(mv.leaderboard_anonymous, false)
          then coalesce(mv.adjective || ' ' || mv.noun, 'Anonymous Student')
          else mv.display_name
        end,
        case when viewer.is_admin then mv.avatar_url
          when coalesce(mv.leaderboard_anonymous, false) then null else mv.avatar_url end,
        case when viewer.is_admin then mv.country
          when coalesce(mv.leaderboard_anonymous, false) or coalesce(mv.show_country_on_leaderboard, true) = false
          then null else mv.country
        end,
        case when viewer.is_admin then mv.is_premium
          when coalesce(mv.leaderboard_anonymous, false) then false else mv.is_premium end,
        mv.score,
        mv.rank
      from public.mv_leaderboard_reviews_alltime mv
      cross join viewer
      where mv.rank <= p_limit or mv.user_id = p_viewer_id
      order by mv.rank asc;
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
      with viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      )
      select
        mv.user_id,
        case when viewer.is_admin then mv.display_name
          when coalesce(mv.leaderboard_anonymous, false)
          then coalesce(mv.adjective || ' ' || mv.noun, 'Anonymous Student')
          else mv.display_name
        end,
        case when viewer.is_admin then mv.avatar_url
          when coalesce(mv.leaderboard_anonymous, false) then null else mv.avatar_url end,
        case when viewer.is_admin then mv.country
          when coalesce(mv.leaderboard_anonymous, false) or coalesce(mv.show_country_on_leaderboard, true) = false
          then null else mv.country
        end,
        case when viewer.is_admin then mv.is_premium
          when coalesce(mv.leaderboard_anonymous, false) then false else mv.is_premium end,
        mv.score,
        mv.rank
      from public.mv_leaderboard_new_cards_alltime mv
      cross join viewer
      where mv.rank <= p_limit or mv.user_id = p_viewer_id
      order by mv.rank asc;
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
      with viewer as (
        select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
      )
      select
        mv.user_id,
        case when viewer.is_admin then mv.display_name
          when coalesce(mv.leaderboard_anonymous, false)
          then coalesce(mv.adjective || ' ' || mv.noun, 'Anonymous Student')
          else mv.display_name
        end,
        case when viewer.is_admin then mv.avatar_url
          when coalesce(mv.leaderboard_anonymous, false) then null else mv.avatar_url end,
        case when viewer.is_admin then mv.country
          when coalesce(mv.leaderboard_anonymous, false) or coalesce(mv.show_country_on_leaderboard, true) = false
          then null else mv.country
        end,
        case when viewer.is_admin then mv.is_premium
          when coalesce(mv.leaderboard_anonymous, false) then false else mv.is_premium end,
        mv.score,
        mv.rank
      from public.mv_leaderboard_xp_alltime mv
      cross join viewer
      where mv.rank <= p_limit or mv.user_id = p_viewer_id
      order by mv.rank asc;
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
-- read from the view, no live branch needed.
create or replace function public.get_leaderboard_streak(
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language sql
stable
security definer
set search_path = public
as $$
  with viewer as (
    select coalesce((select admin from public.users where id = auth.uid()), false) as is_admin
  )
  select
    mv.user_id,
    case when viewer.is_admin then mv.display_name
      when coalesce(mv.leaderboard_anonymous, false)
      then coalesce(mv.adjective || ' ' || mv.noun, 'Anonymous Student')
      else mv.display_name
    end,
    case when viewer.is_admin then mv.avatar_url
      when coalesce(mv.leaderboard_anonymous, false) then null else mv.avatar_url end,
    case when viewer.is_admin then mv.country
      when coalesce(mv.leaderboard_anonymous, false) or coalesce(mv.show_country_on_leaderboard, true) = false
      then null else mv.country
    end,
    case when viewer.is_admin then mv.is_premium
      when coalesce(mv.leaderboard_anonymous, false) then false else mv.is_premium end,
    mv.score,
    mv.rank
  from public.mv_leaderboard_streak mv
  cross join viewer
  where mv.rank <= p_limit or mv.user_id = p_viewer_id
  order by mv.rank asc;
$$;

-- 3. Refresh on a schedule. CONCURRENTLY needs the unique indexes created above so readers
-- (the functions above) are never blocked by a refresh in progress. No pg_net/service-role
-- secret needed here, unlike the deletion cron job -- this is a plain in-database SQL command.
select cron.schedule(
  'refresh-leaderboard-alltime-views',
  '*/5 * * * *',
  $$
  refresh materialized view concurrently public.mv_leaderboard_reviews_alltime;
  refresh materialized view concurrently public.mv_leaderboard_new_cards_alltime;
  refresh materialized view concurrently public.mv_leaderboard_xp_alltime;
  refresh materialized view concurrently public.mv_leaderboard_streak;
  $$
);
