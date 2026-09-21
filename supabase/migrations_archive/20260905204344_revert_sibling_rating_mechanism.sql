-- Reverts the sibling-rating mechanism added by 20260929_credit_sibling_vocab_meanings_as_reviews.sql
-- and reshaped by 20260930_explicit_sibling_rating_via_resolver.sql. The student found the extra
-- "rate this sibling too" step intrusive, and the client (useStudyQueue.ts) no longer calls
-- resolve_confirmed_siblings or passes p_triggered_by_review_log_id -- this brings the database
-- back in line with that, rather than leaving the RPC/column dormant. A confirmed sibling
-- meaning/reading still shows a checkmark mid-review (that's pure client-side bookkeeping,
-- unrelated to any of this); it just no longer produces its own graded card or review_logs row.
--
-- submit_review/undo_review revert to their exact pre-20260929 bodies (20260901_submit_review_
-- resurfaces_today.sql / 20260911_drill_mode_and_atomic_undo.sql) -- neither was touched by any
-- migration in between. review_logs.triggered_by_review_log_id had zero non-null rows at the time
-- of this migration, so dropping it loses no history.

drop function if exists public.resolve_confirmed_siblings(uuid, text, bigint, bigint, bigint, text[]);

drop function if exists public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint, bigint);

create function public.submit_review(
  p_user_id uuid,
  p_exercise_type text,
  p_rating smallint,
  p_kanji_id bigint default null::bigint,
  p_word_id bigint default null::bigint,
  p_kanji_word_id bigint default null::bigint,
  p_hiragana_id bigint default null::bigint,
  p_katakana_id bigint default null::bigint,
  p_user_answer text default null::text,
  p_session_id bigint default null::bigint
)
 returns table(review_log_id bigint, resurfaces_today boolean)
 language plpgsql
as $function$
declare
  v_current record;
  v_result record;
  v_kanji_id_for_log bigint;
  v_word_id_for_log bigint;
  v_hiragana_id_for_log bigint;
  v_katakana_id_for_log bigint;
  v_log_id bigint;
begin
  if p_exercise_type not in ('kanji_meaning', 'kanji_reading', 'vocab_meaning', 'hiragana_reading', 'katakana_reading') then
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
  elsif p_exercise_type = 'vocab_meaning' then
    if p_word_id is null then
      raise exception 'word_id is required for exercise_type "vocab_meaning"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_vocabulary_progress
      where user_id = p_user_id and word_id = p_word_id;
  elsif p_exercise_type = 'hiragana_reading' then
    if p_hiragana_id is null then
      raise exception 'hiragana_id is required for exercise_type "hiragana_reading"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_hiragana_progress
      where user_id = p_user_id and hiragana_id = p_hiragana_id;
  else
    if p_katakana_id is null then
      raise exception 'katakana_id is required for exercise_type "katakana_reading"' using errcode = 'SR400';
    end if;
    select * into v_current from public.user_katakana_progress
      where user_id = p_user_id and katakana_id = p_katakana_id;
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
  elsif p_exercise_type = 'vocab_meaning' then
    update public.user_vocabulary_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_word_id_for_log := v_current.word_id;
  elsif p_exercise_type = 'hiragana_reading' then
    update public.user_hiragana_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_hiragana_id_for_log := v_current.hiragana_id;
  else
    update public.user_katakana_progress set
      status = v_result.status, ease_factor = v_result.ease_factor, interval_days = v_result.interval_days,
      repetitions = v_result.repetitions, lapses = v_result.lapses, learning_step = v_result.learning_step,
      due_at = v_result.due_at, last_reviewed_at = now()
    where id = v_current.id;
    v_katakana_id_for_log := v_current.katakana_id;
  end if;

  insert into public.review_logs (
    user_id, session_id, exercise_type, kanji_id, word_id, hiragana_id, katakana_id, rating, correct, user_answer,
    ease_factor_before, ease_factor_after, interval_before, interval_after,
    status_before, repetitions_before, lapses_before, learning_step_before, due_at_before
  ) values (
    p_user_id, p_session_id, p_exercise_type, v_kanji_id_for_log, v_word_id_for_log,
    v_hiragana_id_for_log, v_katakana_id_for_log, p_rating, p_rating >= 2, p_user_answer,
    v_current.ease_factor, v_result.ease_factor, v_current.interval_days, v_result.interval_days,
    v_current.status, v_current.repetitions, v_current.lapses, v_current.learning_step, v_current.due_at
  )
  returning id into v_log_id;

  return query select v_log_id, (v_result.status != 'review');
end;
$function$;

create or replace function public.undo_review(p_user_id uuid, p_review_log_id bigint default null::bigint)
 returns void
 language plpgsql
as $function$
declare
  v_log record;
  v_table text;
  v_key_column text;
  v_key_value bigint;
begin
  perform pg_advisory_xact_lock(hashtext('undo_review:' || p_user_id::text));

  if p_review_log_id is not null then
    select * into v_log from public.review_logs
      where id = p_review_log_id and user_id = p_user_id and undone = false;
  else
    select * into v_log from public.review_logs
      where user_id = p_user_id and undone = false
      order by reviewed_at desc
      limit 1;
  end if;

  if v_log is null then
    raise exception 'No undoable review found.' using errcode = 'SR404';
  end if;

  if v_log.exercise_type = 'kanji_meaning' then
    v_table := 'user_kanji_meaning_progress';
    v_key_column := 'kanji_id';
    v_key_value := v_log.kanji_id;
  elsif v_log.exercise_type = 'kanji_reading' then
    v_table := 'user_kanji_reading_progress';
    v_key_column := 'kanji_word_id';
    select kw.id into v_key_value from public.kanji_word kw
      where kw.id_kanji = v_log.kanji_id and kw.id_word = v_log.word_id;
  elsif v_log.exercise_type = 'vocab_meaning' then
    v_table := 'user_vocabulary_progress';
    v_key_column := 'word_id';
    v_key_value := v_log.word_id;
  elsif v_log.exercise_type = 'hiragana_reading' then
    v_table := 'user_hiragana_progress';
    v_key_column := 'hiragana_id';
    v_key_value := v_log.hiragana_id;
  else
    v_table := 'user_katakana_progress';
    v_key_column := 'katakana_id';
    v_key_value := v_log.katakana_id;
  end if;

  execute format(
    'update public.%I set status = $1, ease_factor = $2, interval_days = $3, repetitions = $4, lapses = $5, learning_step = $6, due_at = $7 where user_id = $8 and %I = $9',
    v_table, v_key_column
  )
  using v_log.status_before, v_log.ease_factor_before, v_log.interval_before, v_log.repetitions_before,
        v_log.lapses_before, v_log.learning_step_before, v_log.due_at_before, p_user_id, v_key_value;

  update public.review_logs set undone = true where id = v_log.id;
end;
$function$;

alter table public.review_logs drop column if exists triggered_by_review_log_id;

grant execute on function public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint) to authenticated;
grant execute on function public.undo_review(uuid, bigint) to authenticated;
