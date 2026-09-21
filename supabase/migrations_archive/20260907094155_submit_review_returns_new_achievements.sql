-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Supersedes 20261015_submit_review_returns_new_achievements.sql's new_achievement_keys column --
-- renamed to newly_unlocked_achievements to match record_hiragana_drill_result/
-- record_katakana_drill_result's own new column (20261007_kana_drill_due_at_study_day.sql), which
-- now shares the same end-of-session achievements modal (see NewAchievementsModal.tsx,
-- lib/study/newAchievements.ts) instead of 20261015's per-review AchievementEarnedModal, which it
-- also replaces (that modal and its reading-test localStorage cache, readingTestAchievementCache.ts,
-- are removed by this same change).
--
-- Detection technique also changes, though it's semantically equivalent: 20261015 diffed a full
-- before/after array of every earned achievement_key; this instead captures a transaction-start
-- timestamp before the update and reads back user_achievements rows with earned_at >= it
-- afterward (the AFTER UPDATE OF status trigger has already run by the time control returns
-- here) -- the same technique record_hiragana_drill_result/record_katakana_drill_result use, so
-- all three functions that can award an achievement now report it the same way.
--
-- Body is otherwise byte-for-byte identical to submit_review's pre-20261015 definition in
-- 20261003_revert_sibling_rating_mechanism.sql -- only the declare block, the select before the
-- final return, and the return type/row gain the new column.

drop function if exists public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint);

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
 returns table(review_log_id bigint, resurfaces_today boolean, newly_unlocked_achievements text[])
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
  v_before_ts timestamptz := now();
  v_new_achievements text[];
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

  -- The status update above (whichever branch ran) fires the relevant AFTER UPDATE OF status
  -- achievement trigger synchronously, so any newly-earned rows are already visible here.
  select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
    into v_new_achievements
    from public.user_achievements
    where user_id = p_user_id and earned_at >= v_before_ts;

  return query select v_log_id, (v_result.status != 'review'), v_new_achievements;
end;
$function$;

grant execute on function public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint) to authenticated;
