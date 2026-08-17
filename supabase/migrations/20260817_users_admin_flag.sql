-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds an `admin` flag to public.users. Admins see everyone's real
-- (non-anonymized) leaderboard data -- display name, avatar, country,
-- premium badge -- instead of the alias/blank fields that
-- get_leaderboard_* substitute for users with leaderboard_anonymous set.
--
-- Write protection: 20260730_restrict_users_column_grants.sql already
-- revoked UPDATE on all of public.users from `authenticated` and re-grants
-- it column-by-column, only for the columns the app actually lets users
-- edit (display_name, avatar_url, country, show_country_on_leaderboard,
-- updated_at). RLS alone can't stop this -- "Allow individual updates to
-- own profile" only checks row ownership (auth.uid() = id), not which
-- columns are written. `admin` is deliberately left out of every grant
-- list below, so any client attempt to set it (however it's smuggled into
-- an UPDATE) fails with a Postgres permission error before RLS is even
-- evaluated. There's also no INSERT policy on public.users for
-- authenticated/anon (only the SECURITY DEFINER handle_new_user trigger
-- inserts rows, always with admin left at its default), so it can't be set
-- at signup either. service_role (backend/admin tooling) is untouched.

alter table public.users
  add column admin boolean not null default false;

revoke update (admin) on public.users from authenticated, anon;
revoke insert (admin) on public.users from authenticated, anon;

-- The four get_leaderboard_* RPCs are called directly from the browser
-- with a client-supplied p_viewer_id (see lib/client-data/leaderboard.ts),
-- so p_viewer_id is not trustworthy for a privilege check -- a user could
-- simply pass an admin's uuid there. The admin bypass below instead reads
-- auth.uid(), which PostgREST/Supabase derives server-side from the
-- caller's verified JWT and cannot be spoofed via RPC arguments. p_viewer_id
-- keeps its original, unrelated job: making sure the viewer's own row is
-- included even when it falls outside p_limit.
--
-- Same `create or replace` justification as 20260817_leaderboard_anonymity.sql:
-- the return signature is unchanged, so no drop+recreate is needed.

create or replace function public.get_leaderboard_reviews(
  p_period_start timestamp with time zone,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
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
      and (p_period_start is null or r.reviewed_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
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
$function$;


create or replace function public.get_leaderboard_new_cards(
  p_period_start timestamp with time zone,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
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
      and (p_period_start is null or np.created_at >= p_period_start)
    left join public.user_study_settings s on s.user_id = u.id
    left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
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
$function$;


create or replace function public.get_leaderboard_xp(
  p_period_start timestamp with time zone,
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
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
$function$;


create or replace function public.get_leaderboard_streak(
  p_limit integer,
  p_viewer_id uuid
)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
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
      coalesce(r.run_len, 0) as score
    from public.users u
    left join runs r on r.user_id = u.id and r.run_end = current_date
    left join public.user_study_settings s on s.user_id = u.id
    left join public.leaderboard_aliases la on la.id = s.leaderboard_alias_id
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
$function$;
