-- Run this manually in DBeaver or the Supabase SQL editor.
-- Depends on 20260903_study_day_6am_boundary.sql (public.study_day / study_day_bounds).
--
-- Extends today's per-user 6AM-study-day fix to the public leaderboard, which had two
-- separate, independent problems from the per-user dashboard:
--
-- 1. Timezone: leaderboard_stats.current_streak/longest_streak and get_leaderboard_streak all
--    bucketed days via raw `reviewed_at::date` / `current_date` -- server/UTC, with no per-user
--    timezone input anywhere (confirmed: no timezone column existed in public.* before this
--    migration). Fixed by adding user_study_settings.timezone (populated client-side from
--    Intl.DateTimeFormat().resolvedOptions().timeZone, same source the dashboard already uses)
--    and threading it through every leaderboard trigger/function via public.study_day().
--
-- 2. Definition of "active": leaderboard streak/last_active_date were driven ONLY by
--    review_logs (graded reviews), while the per-user dashboard streak (get_review_streak,
--    since 20260917_streak_counts_new_card_introductions.sql) counts any card-introduction
--    activity too (kanji/vocab/hiragana/katakana progress + hiragana/katakana rule progress).
--    A user who only introduces new cards today shows "active" on their own dashboard but a
--    broken streak on the leaderboard. Fixed by extending leaderboard_stats_on_new_card to also
--    bump current_streak/longest_streak/last_active_date (same as the review trigger), and
--    adding the two rule-progress tables (previously not wired to the leaderboard at all --
--    also a silent New-cards/XP undercount, independent of streak) as new triggers.
--
-- Included: a one-time backfill recomputing every existing leaderboard_stats row under the new
-- definition (via get_review_streak/get_review_streak_record/get_streak_active_days, so it can
-- never disagree with what the triggers compute going forward). This can visibly change
-- current_streak/longest_streak for existing users -- expected, since it's fixing a
-- previously-wrong number, not introducing a new one.

-- 1. Store each user's IANA timezone -------------------------------------------------------

alter table public.user_study_settings
  add column if not exists timezone text;

create or replace function public.set_user_timezone(p_user_id uuid, p_timezone text)
returns void
language sql
as $$
  update public.user_study_settings
  set timezone = p_timezone, updated_at = now()
  where user_id = p_user_id
    and timezone is distinct from p_timezone;
$$;

grant execute on function public.set_user_timezone(uuid, text) to authenticated;

-- 2. Shared streak-bump helper -- the "is this day a continuation, a fresh start, or already
--    counted today" logic that leaderboard_stats_on_review_insert already had inline, now
--    reused by every trigger that can bump a leaderboard streak instead of being copy-pasted
--    again for each new activity type. ------------------------------------------------------

create or replace function public.leaderboard_bump_streak(
  p_current_streak integer,
  p_last_active_date date,
  p_day date
)
returns integer
language sql
immutable
as $$
  select case
    when p_last_active_date is null or p_day > p_last_active_date then
      case when p_day = p_last_active_date + 1 then p_current_streak + 1 else 1 end
    else p_current_streak
  end
$$;

-- 3. leaderboard_stats_on_review_insert -- same trigger/table, body now timezone-aware via
--    study_day() and uses the shared bump helper -------------------------------------------

create or replace function public.leaderboard_stats_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 10 else 2 end;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.reviewed_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, reviews_count, xp_points, current_streak, longest_streak, last_active_date)
  values (new.user_id, 1, v_xp, 1, 1, v_day)
  on conflict (user_id) do update
  set reviews_count = ls.reviews_count + 1,
      xp_points = ls.xp_points + v_xp,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
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

-- 4. leaderboard_stats_on_review_undo -- timezone-aware, and now recomputes current_streak /
--    last_active_date from the SAME unified activity definition the dashboard uses (not
--    review_logs alone), so undoing a review can't leave the leaderboard disagreeing with a
--    day that's still active because of a card introduction. ------------------------------

create or replace function public.leaderboard_stats_on_review_undo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when old.correct then 10 else 2 end;
begin
  select timezone into v_tz from public.user_study_settings where user_id = old.user_id;
  v_day := public.study_day(old.reviewed_at, coalesce(v_tz, 'UTC'));

  update public.leaderboard_stats
  set reviews_count = greatest(reviews_count - 1, 0),
      xp_points = greatest(xp_points - v_xp, 0),
      current_streak = coalesce(public.get_review_streak(old.user_id, coalesce(v_tz, 'UTC')), 0),
      last_active_date = (
        select max(d) from public.get_streak_active_days(old.user_id, coalesce(v_tz, 'UTC'))
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

-- 5. leaderboard_stats_on_new_card -- same trigger/tables (kanji/vocab/hiragana/katakana
--    progress inserts), now timezone-aware AND, unlike before, also bumps
--    current_streak/longest_streak/last_active_date -- previously only review_logs could do
--    that, so a day with only new-card introductions showed 0 progress on the leaderboard
--    streak despite counting as "active" on the user's own dashboard. ---------------------

create or replace function public.leaderboard_stats_on_new_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.created_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, new_cards_count, xp_points, current_streak, longest_streak, last_active_date)
  values (new.user_id, 1, 25, 1, 1, v_day)
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$function$;

-- 6. leaderboard_stats_on_new_rule_card -- same as leaderboard_stats_on_new_card, but for the
--    two rule-progress tables, which key their timestamp as seen_at instead of created_at and
--    were never wired to the leaderboard at all (New-cards/XP undercount, separate from
--    streak). New trigger function + two new triggers, nothing dropped. -------------------

create or replace function public.leaderboard_stats_on_new_rule_card()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.seen_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, new_cards_count, xp_points, current_streak, longest_streak, last_active_date)
  values (new.user_id, 1, 25, 1, 1, v_day)
  on conflict (user_id) do update
  set new_cards_count = ls.new_cards_count + 1,
      xp_points = ls.xp_points + 25,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, new_cards_count, xp_points)
  values (new.user_id, v_day, 1, 25)
  on conflict (user_id, day) do update
  set new_cards_count = lds.new_cards_count + 1,
      xp_points = lds.xp_points + 25;

  return new;
end;
$function$;

drop trigger if exists leaderboard_stats_new_hiragana_rule_trigger on public.user_hiragana_rule_progress;
create trigger leaderboard_stats_new_hiragana_rule_trigger
  after insert on public.user_hiragana_rule_progress
  for each row execute function public.leaderboard_stats_on_new_rule_card();

drop trigger if exists leaderboard_stats_new_katakana_rule_trigger on public.user_katakana_rule_progress;
create trigger leaderboard_stats_new_katakana_rule_trigger
  after insert on public.user_katakana_rule_progress
  for each row execute function public.leaderboard_stats_on_new_rule_card();

-- 7. get_leaderboard_streak -- same signature, "is last_active_date today" now compares
--    against each user's OWN study-day (their stored timezone), not one shared server date. -

create or replace function public.get_leaderboard_streak(p_limit integer, p_viewer_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, country text, is_premium boolean, score bigint, rank bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
        case
          when ls.last_active_date = public.study_day(now(), coalesce(s.timezone, 'UTC'))
          then coalesce(ls.current_streak, 0)
          else 0
        end::bigint as score
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
$function$;

-- 8. One-time backfill: recompute every existing leaderboard_stats row under the unified,
--    timezone-aware definition (reuses get_review_streak / get_review_streak_record /
--    get_streak_active_days directly, so it cannot disagree with what the triggers above
--    compute from now on). longest_streak only ever moves up (a past record still stands);
--    current_streak and last_active_date are set to the true recomputed values. Users without
--    a synced timezone yet fall back to UTC, same as everywhere else in this migration. -----

update public.leaderboard_stats ls
set
  current_streak = public.get_review_streak(ls.user_id, coalesce(uss.timezone, 'UTC')),
  longest_streak = greatest(
    ls.longest_streak,
    public.get_review_streak_record(ls.user_id, coalesce(uss.timezone, 'UTC'))
  ),
  last_active_date = greatest(
    ls.last_active_date,
    (select max(d) from public.get_streak_active_days(ls.user_id, coalesce(uss.timezone, 'UTC')))
  ),
  updated_at = now()
from public.user_study_settings uss
where uss.user_id = ls.user_id;
