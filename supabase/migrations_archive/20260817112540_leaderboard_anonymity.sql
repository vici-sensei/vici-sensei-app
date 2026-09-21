-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- "Hide me from leaderboards" used to fully exclude the user from every
-- get_leaderboard_* RPC (see 20260814_leaderboards.sql). That's changing:
-- the user now stays ranked, but shows up with a random reusable alias, no
-- avatar, and no country -- so opting in still contributes to the
-- leaderboard's sense of activity/competition without exposing identity.
--
-- leaderboard_aliases is a small pool of adjective+noun pairs (Japanese-
-- learning themed, same read-only pattern as countries/kanji/vocabulary).
-- Aliases are deliberately NOT unique per user -- several anonymous users
-- can share "Silent Ronin", which is a feature (k-anonymity) rather than a
-- bug, and keeps the pool small.
--
-- An alias is assigned once (by the trigger below, the first time
-- leaderboard_anonymous flips to true) and then stays stable -- toggling
-- anonymity off and back on later keeps the same name. Users can pick a new
-- one anytime via the reroll_leaderboard_alias() RPC (the settings page's
-- dice button). leaderboard_alias_id is intentionally left out of
-- StudySettingsPatch on the frontend so the only way it changes is through
-- the trigger or that RPC, keeping the assignment genuinely random.
--
-- show_country_on_leaderboard lives on public.users (next to country)
-- rather than user_study_settings -- it's a profile-level display
-- preference, not a study setting, and is independent of
-- leaderboard_anonymous (an anonymous user never shows their country
-- regardless of this flag; a non-anonymous user can still choose to hide
-- just their country).

create table public.leaderboard_aliases (
  id bigint generated always as identity primary key,
  adjective text not null,
  noun text not null,
  constraint leaderboard_aliases_adjective_noun_key unique (adjective, noun)
);

alter table public.leaderboard_aliases enable row level security;

create policy "Authenticated users can read leaderboard_aliases" on public.leaderboard_aliases
  for select
  to authenticated
  using (true);

insert into public.leaderboard_aliases (adjective, noun)
select adjective, noun
from unnest(array[
  'Silent', 'Curious', 'Swift', 'Stoic', 'Lucky', 'Wandering', 'Sleepy', 'Fierce', 'Humble', 'Mighty',
  'Gentle', 'Nimble', 'Ancient', 'Radiant', 'Mysterious', 'Playful', 'Quiet', 'Brave', 'Clever', 'Diligent'
]) as adjective
cross join unnest(array[
  'Ronin', 'Otter', 'Sparrow', 'Samurai', 'Koi', 'Fox', 'Tanuki', 'Crane', 'Sensei', 'Dragon',
  'Panda', 'Ninja', 'Turtle', 'Phoenix', 'Owl', 'Tiger', 'Wolf', 'Shogun', 'Badger', 'Heron'
]) as noun;


alter table public.user_study_settings
  rename column leaderboard_opt_out to leaderboard_anonymous;

alter table public.user_study_settings
  add column leaderboard_alias_id bigint references public.leaderboard_aliases (id) on delete set null;


alter table public.users
  add column show_country_on_leaderboard boolean not null default true;

grant update (show_country_on_leaderboard) on public.users to authenticated;


create or replace function public.assign_leaderboard_alias()
 returns trigger
 language plpgsql
as $function$
begin
  if new.leaderboard_anonymous and new.leaderboard_alias_id is null then
    select id into new.leaderboard_alias_id
    from public.leaderboard_aliases
    order by random()
    limit 1;
  end if;
  return new;
end;
$function$;

create trigger assign_leaderboard_alias_trigger
  before insert or update on public.user_study_settings
  for each row execute function public.assign_leaderboard_alias();


create or replace function public.reroll_leaderboard_alias()
 returns table(adjective text, noun text)
 language plpgsql
 security definer
 set search_path = 'public'
as $function$
declare
  v_alias_id bigint;
begin
  select id into v_alias_id
  from public.leaderboard_aliases
  order by random()
  limit 1;

  update public.user_study_settings
  set leaderboard_alias_id = v_alias_id,
      updated_at = now()
  where user_id = auth.uid();

  return query
    select a.adjective, a.noun
    from public.leaderboard_aliases a
    where a.id = v_alias_id;
end;
$function$;

grant execute on function public.reroll_leaderboard_alias() to authenticated;


-- The four leaderboard RPCs (see 20260814_leaderboards.sql and its later
-- amendments) keep the same return signature, so `create or replace` is
-- enough here -- no drop+recreate needed (that's only required when a
-- `returns table(...)` column is added/removed, per the comment in
-- 20260814_add_user_country.sql). Each is restructured into raw -> scored ->
-- ranked: `raw` keeps the original per-user grouping untouched, `scored`
-- applies the anonymization CASE expressions, `ranked` is unchanged.

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
  scored as (
    select
      user_id,
      case when coalesce(leaderboard_anonymous, false)
        then coalesce(adjective || ' ' || noun, 'Anonymous Student')
        else display_name
      end as display_name,
      case when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
      case when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
        then null else country
      end as country,
      case when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
      score
    from raw
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
  scored as (
    select
      user_id,
      case when coalesce(leaderboard_anonymous, false)
        then coalesce(adjective || ' ' || noun, 'Anonymous Student')
        else display_name
      end as display_name,
      case when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
      case when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
        then null else country
      end as country,
      case when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
      score
    from raw
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
  scored as (
    select
      user_id,
      case when coalesce(leaderboard_anonymous, false)
        then coalesce(adjective || ' ' || noun, 'Anonymous Student')
        else display_name
      end as display_name,
      case when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
      case when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
        then null else country
      end as country,
      case when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
      score
    from raw
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
  scored as (
    select
      user_id,
      case when coalesce(leaderboard_anonymous, false)
        then coalesce(adjective || ' ' || noun, 'Anonymous Student')
        else display_name
      end as display_name,
      case when coalesce(leaderboard_anonymous, false) then null else avatar_url end as avatar_url,
      case when coalesce(leaderboard_anonymous, false) or coalesce(show_country_on_leaderboard, true) = false
        then null else country
      end as country,
      case when coalesce(leaderboard_anonymous, false) then false else is_premium end as is_premium,
      score
    from raw
  ),
  ranked as (
    select *, rank() over (order by score desc) as rank
    from scored
  )
  select * from ranked
  where rank <= p_limit or user_id = p_viewer_id
  order by rank asc;
$function$;
