-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- record_hiragana_drill_result/record_katakana_drill_result (20260827_hiragana_katakana_drill.sql,
-- last touched by 20260903_drill_counts_toward_streak.sql) graduate a seion character from the
-- post-introduction drill (status 'learning' -> 'review') with `due_at = now() + interval '1 day'`
-- -- an exact 24-hour clock offset from the moment the 3rd correct answer landed. If a student
-- drills at, say, 18:00 one day and opens the app at 09:00 the next, that card isn't due until
-- 18:00 -- so the queue (correctly, given what's actually due) has nothing to review yet and
-- serves the next new-kana pack instead. The student then only gets to review yesterday's
-- characters after learning today's, which is the opposite of the intended order (reviews always
-- before new material -- see reviewsFirst/mergeKeepingCurrent in useStudyQueue.ts, which already
-- do the right thing once a card is actually flagged due).
--
-- The app already has a "study day" concept for exactly this kind of boundary -- study_day/
-- study_day_bounds (20260903_study_day_6am_boundary.sql), a 6AM-local rollover already used by
-- get_next_due, introduce_hiragana/introduce_katakana's daily quota, get_today_activity_counts,
-- and the streak functions -- but the two drill-result functions were never wired to it. Fix:
-- graduate straight to the START OF THE NEXT STUDY DAY (study_day_bounds(p_timezone).day_end,
-- evaluated at the graduation moment) instead of an exact +1 day. A character learned at any hour
-- today becomes due the next time the student opens the app on or after 6AM local the following
-- day, not "at this same clock time tomorrow". p_timezone is threaded through the same way
-- introduce_hiragana_examples/get_today_activity_counts already receive it -- the browser's live
-- IANA zone on every call (see lib/client-data/study.ts), not the possibly-stale/unset
-- user_study_settings.timezone column.
--
-- Deliberately scoped to these two functions only -- compute_review_result (the shared SM2-ish
-- algorithm every OTHER review, on every track, including a kana card's own 2nd+ review once it's
-- graduated past this drill) is untouched, so kanji/vocab and the standard track behave exactly as
-- before.

drop function if exists public.record_hiragana_drill_result(uuid, bigint, boolean);
-- Also drop the 4-arg (p_timezone-carrying) shape: an earlier run of this same migration file
-- (before the newly_unlocked_achievements column existed) already landed it live, and Postgres
-- won't let create-or-replace change a function's OUT-parameter row type in place.
drop function if exists public.record_hiragana_drill_result(uuid, bigint, boolean, text);

create or replace function public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text default 'UTC'::text)
returns table(drill_streak integer, graduated boolean, newly_unlocked_achievements text[])
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
  v_day_end timestamptz;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
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
    return query select 0, false, '{}'::text[];
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    select day_end into v_day_end from public.study_day_bounds(p_timezone);
    update public.user_hiragana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = v_day_end,
      last_reviewed_at = now(), last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
    -- The status='review' update above fires user_hiragana_progress_updates_achievements_trigger
    -- synchronously (AFTER UPDATE triggers complete before control returns here), so any
    -- newly-earned rows are already visible with earned_at >= v_before_ts (user_achievements.
    -- earned_at defaults to now(), which -- like v_before_ts -- is transaction-start-constant).
    select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
      into v_new_achievements
      from public.user_achievements
      where user_id = p_user_id and earned_at >= v_before_ts;
    return query select v_streak, true, v_new_achievements;
    return;
  end if;

  update public.user_hiragana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false, '{}'::text[];
end;
$function$;

grant execute on function public.record_hiragana_drill_result(uuid, bigint, boolean, text) to authenticated;

drop function if exists public.record_katakana_drill_result(uuid, bigint, boolean);
-- See the matching note above record_hiragana_drill_result -- same reason.
drop function if exists public.record_katakana_drill_result(uuid, bigint, boolean, text);

create or replace function public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text default 'UTC'::text)
returns table(drill_streak integer, graduated boolean, newly_unlocked_achievements text[])
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
  v_day_end timestamptz;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
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
    return query select 0, false, '{}'::text[];
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    select day_end into v_day_end from public.study_day_bounds(p_timezone);
    update public.user_katakana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = v_day_end,
      last_reviewed_at = now(), last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
    -- See record_hiragana_drill_result above for why v_before_ts/earned_at comparison is safe.
    select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
      into v_new_achievements
      from public.user_achievements
      where user_id = p_user_id and earned_at >= v_before_ts;
    return query select v_streak, true, v_new_achievements;
    return;
  end if;

  update public.user_katakana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false, '{}'::text[];
end;
$function$;

grant execute on function public.record_katakana_drill_result(uuid, bigint, boolean, text) to authenticated;

-- Backfill: realign due_at for kana that already graduated through this exact drill path (seion,
-- exactly one review so far -- repetitions = 1, interval_days = 1, status = 'review') and whose
-- due_at is therefore still sitting on the old exact-24h value. Recomputed from last_reviewed_at
-- (the graduation moment, stamped by the drill functions above) through the same study_day_bounds
-- used going forward, per-user timezone where known (falls back to UTC, same as every other
-- timezone-aware call site in this codebase). Scoped to kana_type = 'seion' specifically --
-- dakuten/handakuten/yoon/etc rule-and-example cards graduate through the shared, untouched
-- compute_review_result path instead (via the normal rate()/submit_review flow, never through
-- record_hiragana_drill_result/record_katakana_drill_result) and are deliberately left alone.
update public.user_hiragana_progress p
set due_at = (
  select b.day_end
  from public.user_study_settings s,
       lateral public.study_day_bounds(coalesce(s.timezone, 'UTC'), 6, p.last_reviewed_at) b
  where s.user_id = p.user_id
)
where p.status = 'review'
  and p.repetitions = 1
  and p.interval_days = 1
  and p.last_reviewed_at is not null
  and exists (
    select 1 from public.hiragana h where h.id = p.hiragana_id and h.kana_type = 'seion'
  );

update public.user_katakana_progress p
set due_at = (
  select b.day_end
  from public.user_study_settings s,
       lateral public.study_day_bounds(coalesce(s.timezone, 'UTC'), 6, p.last_reviewed_at) b
  where s.user_id = p.user_id
)
where p.status = 'review'
  and p.repetitions = 1
  and p.interval_days = 1
  and p.last_reviewed_at is not null
  and exists (
    select 1 from public.katakana k where k.id = p.katakana_id and k.kana_type = 'seion'
  );
