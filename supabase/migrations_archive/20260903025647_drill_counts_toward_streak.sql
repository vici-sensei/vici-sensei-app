-- Run this manually in DBeaver or the Supabase SQL editor.
-- Depends on 20260903_study_day_6am_boundary.sql (public.study_day) and
-- 20260903_leaderboard_timezone_and_activity_streak.sql (public.leaderboard_bump_streak).
--
-- Closes a gap found while explaining the earlier streak fixes: a hiragana/katakana "reading"
-- card in drill mode (kana_type='seion', repeat-until-3-correct-in-a-row before it graduates to
-- normal spaced repetition) is answered via record_hiragana_drill_result/
-- record_katakana_drill_result (20260827_hiragana_katakana_drill.sql), which only ever UPDATEs
-- the existing user_hiragana_progress/user_katakana_progress row (drill_streak/status/due_at) --
-- by design, so drill repeats don't pollute review_logs/reviews_count/retention_rate the way a
-- graded review does. But that also meant NO drill answer, not even the 3rd one that graduates
-- the card, touched any of the 7 columns get_streak_active_days/get_review_activity read
-- (created_at/seen_at/reviewed_at) -- so a day spent purely drilling counted as inactive on both
-- the dashboard and the leaderboard, even though the user clearly showed up and engaged.
--
-- Fix: a dedicated last_drilled_at timestamp, set on every drill answer (right or wrong, so
-- "did you engage today" matches how review_logs already counts both), read only by the
-- activity/streak functions -- kept deliberately separate from review_logs so retention_rate,
-- reviewed_today, and reviews-based XP stay exactly as they were (drilling isn't a graded
-- review and isn't a new-card introduction, so it shouldn't move either of those).

-- 1. New column, one per kana table -- nullable, never backfillable (no prior drill answer ever
--    recorded a timestamp anywhere, so there's nothing to reconstruct for past activity). -----

alter table public.user_hiragana_progress add column if not exists last_drilled_at timestamptz;
alter table public.user_katakana_progress add column if not exists last_drilled_at timestamptz;

-- 2. record_hiragana_drill_result / record_katakana_drill_result -- same signature/return
--    shape, every branch (wrong / correct-not-yet-3 / correct-3rd-graduates) now also stamps
--    last_drilled_at. -------------------------------------------------------------------

create or replace function public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean)
returns table(drill_streak integer, graduated boolean)
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
begin
  select * into v_current from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id;

  if v_current is null then
    raise exception 'No progress found for this hiragana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This hiragana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_hiragana_progress set drill_streak = 0, last_drilled_at = now(), updated_at = now()
      where id = v_current.id;
    return query select 0, false;
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    update public.user_hiragana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = now() + interval '1 day',
      last_reviewed_at = now(), last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
    return query select v_streak, true;
    return;
  end if;

  update public.user_hiragana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false;
end;
$function$;

create or replace function public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean)
returns table(drill_streak integer, graduated boolean)
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
begin
  select * into v_current from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id;

  if v_current is null then
    raise exception 'No progress found for this katakana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This katakana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_katakana_progress set drill_streak = 0, last_drilled_at = now(), updated_at = now()
      where id = v_current.id;
    return query select 0, false;
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    update public.user_katakana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = now() + interval '1 day',
      last_reviewed_at = now(), last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
    return query select v_streak, true;
    return;
  end if;

  update public.user_katakana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false;
end;
$function$;

-- 3. get_streak_active_days / get_review_activity -- same signatures, union gains
--    last_drilled_at from both kana tables. -------------------------------------------------

create or replace function public.get_streak_active_days(p_user_id uuid, p_timezone text default 'UTC')
returns table (d date)
language sql
stable
as $$
  select distinct public.study_day(a.at, p_timezone) as d from (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
  ) a;
$$;

create or replace function public.get_review_activity(
  p_user_id uuid,
  p_timezone text,
  p_days integer default 7
)
returns table (
  day date,
  has_activity boolean
)
language sql
stable
as $$
  with days as (
    select generate_series(
      public.study_day(now(), p_timezone) - (p_days - 1),
      public.study_day(now(), p_timezone),
      interval '1 day'
    )::date as day
  ),
  activity_at as (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
  )
  select
    d.day,
    exists (
      select 1 from activity_at a
      where public.study_day(a.at, p_timezone) = d.day
    ) as has_activity
  from days d
  order by d.day asc;
$$;

-- 4. leaderboard_stats_on_drill -- new, narrow trigger: drilling bumps current_streak /
--    longest_streak / last_active_date only. Deliberately does NOT touch new_cards_count or
--    xp_points -- drilling isn't introducing a new card and isn't a graded review, so it
--    shouldn't earn XP or count as a "new card" the way those two do (fix option #1 from the
--    proposal; XP-for-drilling was left out -- ask if you want that added, it's a small,
--    separate change on top of this one). ---------------------------------------------------

create or replace function public.leaderboard_stats_on_drill()
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
  v_day := public.study_day(new.last_drilled_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls (user_id, current_streak, longest_streak, last_active_date)
  values (new.user_id, 1, 1, v_day)
  on conflict (user_id) do update
  set current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  return new;
end;
$function$;

drop trigger if exists leaderboard_stats_hiragana_drill_trigger on public.user_hiragana_progress;
create trigger leaderboard_stats_hiragana_drill_trigger
  after update of last_drilled_at on public.user_hiragana_progress
  for each row
  when (new.last_drilled_at is distinct from old.last_drilled_at)
  execute function public.leaderboard_stats_on_drill();

drop trigger if exists leaderboard_stats_katakana_drill_trigger on public.user_katakana_progress;
create trigger leaderboard_stats_katakana_drill_trigger
  after update of last_drilled_at on public.user_katakana_progress
  for each row
  when (new.last_drilled_at is distinct from old.last_drilled_at)
  execute function public.leaderboard_stats_on_drill();
