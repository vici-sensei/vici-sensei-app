-- When a student answers a "Vocabulary" card and also confirms a sibling homograph's meaning
-- along the way (see checkVocabMeaningAnswer's "alternate" outcome -- e.g. answering the なか
-- card but also correctly naming ちゅう's "middle" sense), that sibling word's OWN
-- user_vocabulary_progress row currently isn't touched at all: it stays on its own unrelated
-- schedule as if nothing happened, even though the student just demonstrated they know it.
--
-- This makes submit_review credit that sibling as a real review too (fixed rating = "Good" = 2,
-- since the student didn't separately rate ITS difficulty), but only when it already has a
-- progress row that's past 'new'/'suspended' -- a sibling never introduced at all is left alone
-- entirely, to go through the normal "New word" intro flow whenever its turn comes.
--
-- Trust boundary: the client tells the server which meaning STRINGS it believes were confirmed
-- (p_confirmed_sibling_meanings), not which word_ids to credit. The server independently looks up
-- which sibling word(s) actually have that exact meaning in their own public.vocabulary.meanings
-- before crediting anything -- a buggy or tampered client can never advance an unrelated card's
-- SRS state just by claiming an arbitrary id. This is a cheap, reliable check specifically because
-- checkVocabMeaningAnswer already reports the verbatim DB string it matched (meanings[idx], not
-- the student's raw typed text) -- comparing that string back against the sibling's own stored
-- meanings needs no fuzzy/Levenshtein logic, just a normalized exact match.
--
-- Each auto-credited sibling gets its own review_logs row (so it shows up in history/undo/stats
-- normally, same as the user's own explicit rating -- 2026-09-04 discussion decided this SHOULD
-- count toward reviewed_today/XP/streak like a real review), linked back to the review that
-- triggered it via the new triggered_by_review_log_id column. undo_review cascades: undoing a
-- review now also undoes any sibling reviews it triggered, so Undo can't leave an orphaned,
-- falsely-advanced sibling behind.

alter table public.review_logs
  add column if not exists triggered_by_review_log_id bigint references public.review_logs(id);

create index if not exists idx_review_logs_triggered_by
  on public.review_logs (triggered_by_review_log_id)
  where triggered_by_review_log_id is not null;

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
  p_session_id bigint default null::bigint,
  p_confirmed_sibling_meanings text[] default null::text[]
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
  v_word text;
  v_normalized_meanings text[];
  v_sibling record;
  v_sibling_result record;
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

  -- Credit any confirmed sibling meanings as their own reviews (vocab_meaning only). The server
  -- never trusts a word_id from the client -- it re-derives which sibling(s) actually own each
  -- confirmed meaning string from public.vocabulary itself.
  if p_exercise_type = 'vocab_meaning' and p_confirmed_sibling_meanings is not null
     and array_length(p_confirmed_sibling_meanings, 1) > 0 then

    select word into v_word from public.vocabulary where id = p_word_id;
    select array_agg(distinct lower(trim(s))) into v_normalized_meanings
      from unnest(p_confirmed_sibling_meanings) as s;

    for v_sibling in
      select p2.id as progress_id, p2.word_id, p2.status, p2.ease_factor, p2.interval_days,
             p2.repetitions, p2.lapses, p2.learning_step, p2.due_at
      from public.vocabulary v2
      join public.user_vocabulary_progress p2 on p2.word_id = v2.id and p2.user_id = p_user_id
      where v2.word = v_word
        and v2.id != p_word_id
        and p2.status not in ('new', 'suspended')
        and exists (
          select 1 from unnest(v2.meanings) as m
          where lower(trim(m)) = any (v_normalized_meanings)
        )
    loop
      select * into v_sibling_result from public.compute_review_result(
        v_sibling.status, v_sibling.ease_factor, v_sibling.interval_days,
        v_sibling.repetitions, v_sibling.lapses, v_sibling.learning_step, 2
      );

      update public.user_vocabulary_progress set
        status = v_sibling_result.status, ease_factor = v_sibling_result.ease_factor,
        interval_days = v_sibling_result.interval_days, repetitions = v_sibling_result.repetitions,
        lapses = v_sibling_result.lapses, learning_step = v_sibling_result.learning_step,
        due_at = v_sibling_result.due_at, last_reviewed_at = now()
      where id = v_sibling.progress_id;

      insert into public.review_logs (
        user_id, session_id, exercise_type, word_id, rating, correct, user_answer,
        ease_factor_before, ease_factor_after, interval_before, interval_after,
        status_before, repetitions_before, lapses_before, learning_step_before, due_at_before,
        triggered_by_review_log_id
      ) values (
        p_user_id, p_session_id, 'vocab_meaning', v_sibling.word_id, 2, true, null,
        v_sibling.ease_factor, v_sibling_result.ease_factor, v_sibling.interval_days, v_sibling_result.interval_days,
        v_sibling.status, v_sibling.repetitions, v_sibling.lapses, v_sibling.learning_step, v_sibling.due_at,
        v_log_id
      );
    end loop;
  end if;

  return query select v_log_id, (v_result.status != 'review');
end;
$function$;

create or replace function public.undo_review(p_user_id uuid, p_review_log_id bigint default null::bigint)
 returns void
 language plpgsql
as $function$
declare
  v_log record;
  v_row record;
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

  -- Undo the review itself, plus any sibling reviews it auto-triggered (see submit_review) --
  -- otherwise Undo could leave a sibling's vocab_meaning card falsely advanced with no way back.
  for v_row in
    select * from public.review_logs
    where (id = v_log.id or triggered_by_review_log_id = v_log.id)
      and undone = false
  loop
    if v_row.exercise_type = 'kanji_meaning' then
      v_table := 'user_kanji_meaning_progress';
      v_key_column := 'kanji_id';
      v_key_value := v_row.kanji_id;
    elsif v_row.exercise_type = 'kanji_reading' then
      v_table := 'user_kanji_reading_progress';
      v_key_column := 'kanji_word_id';
      select kw.id into v_key_value from public.kanji_word kw
        where kw.id_kanji = v_row.kanji_id and kw.id_word = v_row.word_id;
    elsif v_row.exercise_type = 'vocab_meaning' then
      v_table := 'user_vocabulary_progress';
      v_key_column := 'word_id';
      v_key_value := v_row.word_id;
    elsif v_row.exercise_type = 'hiragana_reading' then
      v_table := 'user_hiragana_progress';
      v_key_column := 'hiragana_id';
      v_key_value := v_row.hiragana_id;
    else
      v_table := 'user_katakana_progress';
      v_key_column := 'katakana_id';
      v_key_value := v_row.katakana_id;
    end if;

    execute format(
      'update public.%I set status = $1, ease_factor = $2, interval_days = $3, repetitions = $4, lapses = $5, learning_step = $6, due_at = $7 where user_id = $8 and %I = $9',
      v_table, v_key_column
    )
    using v_row.status_before, v_row.ease_factor_before, v_row.interval_before, v_row.repetitions_before,
          v_row.lapses_before, v_row.learning_step_before, v_row.due_at_before, p_user_id, v_key_value;

    update public.review_logs set undone = true where id = v_row.id;
  end loop;
end;
$function$;

grant execute on function public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint, text[]) to authenticated;
grant execute on function public.undo_review(uuid, bigint) to authenticated;
