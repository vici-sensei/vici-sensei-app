-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- submitReview (lib/data/reviews.ts) computed the SM-2 scheduling result (lib/srs/scheduler.ts's
-- applyReview) client-side using Date.now(), then wrote due_at/last_reviewed_at/updated_at
-- straight from the browser's clock. A wrong or spoofed client clock can set due_at to
-- whatever the client wants -- including into the past, making a card immediately "due" again
-- for repeat easy reviews, which feeds streak/XP/leaderboard. Move the whole scheduling
-- decision + progress update + review_logs insert into one atomic server-side RPC using now().
--
-- compute_review_result mirrors applyLearningReview/applyReviewPhaseReview/clampEase from
-- lib/srs/scheduler.ts line-for-line (constants hardcoded here the same way introduce_kanji
-- already hardcodes interval '1 minute' -- see lib/srs/constants.ts for the JS source of truth):
--   LEARNING_STEPS_MINUTES = [1, 10], MIN_EASE_FACTOR = 1.3,
--   EASE_AGAIN_PENALTY = 0.2, EASE_HARD_PENALTY = 0.15, EASE_EASY_BONUS = 0.15,
--   HARD_INTERVAL_MULTIPLIER = 1.2, EASY_BONUS_MULTIPLIER = 1.3,
--   GRADUATING_INTERVAL_DAYS = 1, EASY_GRADUATING_INTERVAL_DAYS = 4, SECOND_INTERVAL_DAYS = 6.
--
-- lib/srs/scheduler.ts itself is untouched -- it's still used client-side for the rating-button
-- interval previews (cosmetic display, never written back), so it must keep producing the same
-- numbers as this SQL port.

create or replace function public.compute_review_result(
  p_status text,
  p_ease_factor numeric,
  p_interval_days integer,
  p_repetitions integer,
  p_lapses integer,
  p_learning_step integer,
  p_rating smallint
)
returns table(
  status text, ease_factor numeric, interval_days integer,
  repetitions integer, lapses integer, learning_step integer, due_at timestamptz
)
language plpgsql
stable
as $function$
declare
  c_steps constant integer[] := array[1, 10];
  c_min_ease constant numeric := 1.3;
  c_ease_again constant numeric := 0.2;
  c_ease_hard constant numeric := 0.15;
  c_ease_easy constant numeric := 0.15;
  c_hard_mult constant numeric := 1.2;
  c_easy_mult constant numeric := 1.3;
  c_graduating constant integer := 1;
  c_easy_graduating constant integer := 4;
  c_second constant integer := 6;
  v_next_step integer;
  v_ease numeric;
  v_interval integer;
  v_reps integer;
begin
  if p_status in ('learning', 'relearning') then
    if p_rating = 0 then
      return query select p_status, p_ease_factor, p_interval_days, p_repetitions, p_lapses,
        0, now() + make_interval(mins => c_steps[1]);
    elsif p_rating = 1 then
      return query select p_status, p_ease_factor, p_interval_days, p_repetitions, p_lapses,
        p_learning_step, now() + make_interval(mins => c_steps[p_learning_step + 1]);
    elsif p_rating = 3 then
      return query select 'review'::text, p_ease_factor, c_easy_graduating, p_repetitions + 1, p_lapses,
        0, now() + make_interval(days => c_easy_graduating);
    else
      v_next_step := p_learning_step + 1;
      if v_next_step >= array_length(c_steps, 1) then
        return query select 'review'::text, p_ease_factor, c_graduating, p_repetitions + 1, p_lapses,
          0, now() + make_interval(days => c_graduating);
      else
        return query select p_status, p_ease_factor, p_interval_days, p_repetitions, p_lapses,
          v_next_step, now() + make_interval(mins => c_steps[v_next_step + 1]);
      end if;
    end if;
  else
    if p_rating = 0 then
      v_ease := round(greatest(c_min_ease, p_ease_factor - c_ease_again), 2);
      return query select 'relearning'::text, v_ease, p_interval_days, 0, p_lapses + 1,
        0, now() + make_interval(mins => c_steps[1]);
    elsif p_rating = 1 then
      v_ease := round(greatest(c_min_ease, p_ease_factor - c_ease_hard), 2);
      v_interval := greatest(p_interval_days + 1, round(p_interval_days * c_hard_mult)::integer);
      return query select 'review'::text, v_ease, v_interval, p_repetitions, p_lapses,
        0, now() + make_interval(days => v_interval);
    else
      v_ease := round(greatest(c_min_ease, p_ease_factor + (case when p_rating = 3 then c_ease_easy else 0 end)), 2);
      v_reps := p_repetitions + 1;
      if v_reps = 1 then v_interval := c_graduating;
      elsif v_reps = 2 then v_interval := c_second;
      else v_interval := round(p_interval_days * v_ease)::integer;
      end if;
      if p_rating = 3 then v_interval := round(v_interval * c_easy_mult)::integer; end if;
      return query select 'review'::text, v_ease, v_interval, v_reps, p_lapses,
        0, now() + make_interval(days => v_interval);
    end if;
  end if;
end;
$function$;

grant execute on function public.compute_review_result(text, numeric, integer, integer, integer, integer, smallint) to authenticated;

create or replace function public.submit_review(
  p_user_id uuid,
  p_exercise_type text,
  p_rating smallint,
  p_kanji_id bigint default null,
  p_word_id bigint default null,
  p_kanji_word_id bigint default null,
  p_user_answer text default null
)
returns bigint
language plpgsql
as $function$
declare
  v_current record;
  v_result record;
  v_kanji_id_for_log bigint;
  v_word_id_for_log bigint;
  v_session_id bigint;
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

  select id into v_session_id from public.study_sessions
    where user_id = p_user_id and ended_at is null
    order by started_at desc limit 1;

  insert into public.review_logs (
    user_id, session_id, exercise_type, kanji_id, word_id, rating, correct, user_answer,
    ease_factor_before, ease_factor_after, interval_before, interval_after,
    status_before, repetitions_before, lapses_before, learning_step_before, due_at_before
  ) values (
    p_user_id, v_session_id, p_exercise_type, v_kanji_id_for_log, v_word_id_for_log, p_rating, p_rating >= 2, p_user_answer,
    v_current.ease_factor, v_result.ease_factor, v_current.interval_days, v_result.interval_days,
    v_current.status, v_current.repetitions, v_current.lapses, v_current.learning_step, v_current.due_at
  )
  returning id into v_log_id;

  return v_log_id;
end;
$function$;

grant execute on function public.submit_review(uuid, text, smallint, bigint, bigint, bigint, text) to authenticated;
