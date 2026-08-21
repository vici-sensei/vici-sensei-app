-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- submit_review inferred its session_id by picking the caller's most recently started
-- still-open study_session (`where ended_at is null order by started_at desc limit 1`).
-- That's a race: useStudyQueue.ts's rate() fires submit_review for the last card of a
-- session through a fire-and-forget mutation chain, then the queue-emptied effect
-- immediately calls end_study_session for that same session. If end_study_session's
-- `ended_at = now()` update commits first, submit_review's inference query no longer
-- matches that session (its ended_at is no longer null), so the review lands with
-- session_id = null -- silently excluded from that session's cards_reviewed count, even
-- though the row exists in review_logs (confirmed live: a 3-answer session that raced this
-- way showed "2 Reviewed" on /study/summary while get_today_activity_counts, which counts
-- review_logs with no session_id filter, correctly showed all 3).
--
-- Fix: stop asking the database to guess the session from timing. introduce_kanji/
-- introduce_vocabulary (20260820_server_side_new_card_day_bounds.sql) already take an
-- explicit p_session_id from the client, which knows its own session id from
-- start_study_session's response -- submit_review now does the same, so the result no
-- longer depends on the order two concurrent requests happen to commit in.

drop function if exists public.submit_review(uuid, text, smallint, bigint, bigint, bigint, text);

create function public.submit_review(
  p_user_id uuid,
  p_exercise_type text,
  p_rating smallint,
  p_kanji_id bigint default null,
  p_word_id bigint default null,
  p_kanji_word_id bigint default null,
  p_user_answer text default null,
  p_session_id bigint default null
)
returns bigint
language plpgsql
as $function$
declare
  v_current record;
  v_result record;
  v_kanji_id_for_log bigint;
  v_word_id_for_log bigint;
  v_log_id bigint;
begin
  if p_exercise_type not in ('kanji_meaning', 'kanji_reading', 'vocab_meaning') then
    raise exception 'Invalid exercise_type "%"', p_exercise_type using errcode = 'SR400';
  end if;
  if p_rating not in (0, 1, 2, 3) then
    raise exception 'Invalid rating "%"', p_rating using errcode = 'SR400';
  end if;

  if p_exercise_type = 'kanji_meaning' then
    if p_kanji_id is null then
      raise exception 'kanji_id is required for exercise_type "kanji_meaning"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_kanji_meaning_progress
      where user_id = p_user_id and kanji_id = p_kanji_id;
  elsif p_exercise_type = 'kanji_reading' then
    if p_kanji_word_id is null then
      raise exception 'kanji_word_id is required for exercise_type "kanji_reading"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_kanji_reading_progress
      where user_id = p_user_id and kanji_word_id = p_kanji_word_id;
  else
    if p_word_id is null then
      raise exception 'word_id is required for exercise_type "vocab_meaning"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_vocabulary_progress
      where user_id = p_user_id and word_id = p_word_id;
  end if;

  if v_current is null then
    raise exception 'No progress found for this card. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status in ('new', 'suspended') then
    raise exception 'Cannot review a card with status "%"', v_current.status using errcode = 'SR400';
  end if;

  select * into v_result from public.compute_review_result(
    v_current.status, v_current.ease_factor, v_current.interval_days,
    v_current.repetitions, v_current.lapses, v_current.learning_step, p_rating
  );

  if p_exercise_type = 'kanji_meaning' then
    update public.user_kanji_meaning_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_kanji_id_for_log := v_current.kanji_id;
  elsif p_exercise_type = 'kanji_reading' then
    update public.user_kanji_reading_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_kanji_id_for_log := v_current.kanji_id;
    select id_word into v_word_id_for_log from public.kanji_word where id = v_current.kanji_word_id;
  else
    update public.user_vocabulary_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_word_id_for_log := v_current.word_id;
  end if;

  insert into public.review_logs (
    user_id, session_id, exercise_type, kanji_id, word_id, rating, correct, user_answer,
    ease_factor_before, ease_factor_after, interval_before, interval_after,
    status_before, repetitions_before, lapses_before, learning_step_before, due_at_before
  ) values (
    p_user_id, p_session_id, p_exercise_type, v_kanji_id_for_log, v_word_id_for_log, p_rating, p_rating >= 2, p_user_answer,
    v_current.ease_factor, v_result.ease_factor, v_current.interval_days, v_result.interval_days,
    v_current.status, v_current.repetitions, v_current.lapses, v_current.learning_step, v_current.due_at
  )
  returning id into v_log_id;

  return v_log_id;
end;
$function$;

grant execute on function public.submit_review(uuid, text, smallint, bigint, bigint, bigint, text, bigint) to authenticated;
