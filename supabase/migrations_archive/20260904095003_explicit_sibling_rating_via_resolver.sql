-- Supersedes the auto-crediting block 20260929_credit_sibling_vocab_meanings_as_reviews.sql added
-- to submit_review: that version silently rated a confirmed sibling "Good" on the student's
-- behalf. Decided against that -- the student should rate the sibling too, same as any other
-- card, not have a difficulty guessed for them.
--
-- New shape: submit_review goes back to doing exactly one thing (the card it was actually called
-- for), plus accepting an optional p_triggered_by_review_log_id so a *separate*, explicit review
-- of the sibling can still be linked back to the review that surfaced it (for undo_review's
-- cascade, unchanged from 20260929). A new read-only RPC, resolve_confirmed_siblings, lets the
-- client look up which sibling(s) actually own the confirmed text -- same trust boundary as
-- before (the server re-derives the match from public.vocabulary/kanji itself, never trusts an
-- id from the client) -- and enough of their current SRS state to render a normal rating step for
-- them (same card shell, no typing -- see ReviewCardRateSibling). The client then submits a real
-- submit_review call for that sibling once the student picks its own rating.
--
-- Symmetric across both card types now: vocab_meaning (word_id-keyed, matches confirmed text
-- against sibling vocabulary.meanings) and kanji_reading (kanji_word_id-keyed, matches confirmed
-- text against a sibling kanji_word's own vocabulary.kana_reading/romaji_reading/other_readings) --
-- Word reading gets the same "answer credited, then rate it separately" treatment Vocabulary just
-- got, using the exact same mechanism.

drop function if exists public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint, text[]);

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
  p_triggered_by_review_log_id bigint default null::bigint
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
  v_triggered_by bigint;
begin
  if p_exercise_type not in ('kanji_meaning', 'kanji_reading', 'vocab_meaning', 'hiragana_reading', 'katakana_reading') then
    raise exception 'Invalid exercise_type "%"', p_exercise_type using errcode = 'SR400';
  end if;
  if p_rating not in (0, 1, 2, 3) then
    raise exception 'Invalid rating "%"', p_rating using errcode = 'SR400';
  end if;

  -- Silently ignored rather than erroring if it doesn't belong to this user -- it's only ever
  -- bookkeeping for undo_review's cascade, never something SRS state depends on, so a bogus/
  -- foreign id just means the new row links to nothing instead of failing the whole review.
  if p_triggered_by_review_log_id is not null then
    select id into v_triggered_by from public.review_logs
      where id = p_triggered_by_review_log_id and user_id = p_user_id;
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
    status_before, repetitions_before, lapses_before, learning_step_before, due_at_before,
    triggered_by_review_log_id
  ) values (
    p_user_id, p_session_id, p_exercise_type, v_kanji_id_for_log, v_word_id_for_log,
    v_hiragana_id_for_log, v_katakana_id_for_log, p_rating, p_rating >= 2, p_user_answer,
    v_current.ease_factor, v_result.ease_factor, v_current.interval_days, v_result.interval_days,
    v_current.status, v_current.repetitions, v_current.lapses, v_current.learning_step, v_current.due_at,
    v_triggered_by
  )
  returning id into v_log_id;

  return query select v_log_id, (v_result.status != 'review');
end;
$function$;

-- ---------------------------------------------------------------------------
-- resolve_confirmed_siblings: read-only lookup for the client, after a vocab_meaning/kanji_reading
-- review confirmed one or more sibling meanings/readings along the way. Never mutates anything --
-- the client still has to submit a real submit_review for whichever sibling the student rates.
-- Returns just enough per sibling to render ReviewCardRateSibling and compute its rating previews
-- client-side the normal way (see previewRatingLabels) -- SRS math itself stays entirely in
-- TypeScript/plpgsql's shared formulas, this only surfaces the raw state.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_confirmed_siblings(
  p_user_id uuid,
  p_exercise_type text,
  p_kanji_id bigint default null::bigint,
  p_word_id bigint default null::bigint,
  p_kanji_word_id bigint default null::bigint,
  p_confirmed_texts text[] default null::text[]
)
 returns table(
   exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
   kanji_char text, word text, kana_reading text, furiganas text[], word_meanings text[],
   status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
 )
 language sql
 stable
as $function$
  with normalized as (
    select coalesce(array_agg(distinct lower(trim(s))), array[]::text[]) as arr
    from unnest(coalesce(p_confirmed_texts, array[]::text[])) as s
  )
  select
    'vocab_meaning'::text, p2.id, null::bigint, v2.id, null::bigint,
    null::text, v2.word, v2.kana_reading, v2.furiganas, v2.meanings,
    p2.status, p2.ease_factor, p2.interval_days, p2.repetitions, p2.lapses, p2.learning_step
  from public.vocabulary v2
  join public.user_vocabulary_progress p2 on p2.word_id = v2.id and p2.user_id = p_user_id
  cross join normalized n
  where p_exercise_type = 'vocab_meaning'
    and p_word_id is not null
    and v2.word = (select word from public.vocabulary where id = p_word_id)
    and v2.id != p_word_id
    and p2.status not in ('new', 'suspended')
    and exists (select 1 from unnest(v2.meanings) as m where lower(trim(m)) = any(n.arr))

  union all

  select
    'kanji_reading'::text, p2.id, kw2.id_kanji, v2.id, kw2.id,
    k2.kanji, v2.word, v2.kana_reading, v2.furiganas, null::text[],
    p2.status, p2.ease_factor, p2.interval_days, p2.repetitions, p2.lapses, p2.learning_step
  from public.kanji_word kw2
  join public.kanji k2 on k2.id = kw2.id_kanji
  join public.vocabulary v2 on v2.id = kw2.id_word
  join public.user_kanji_reading_progress p2 on p2.kanji_word_id = kw2.id and p2.user_id = p_user_id
  cross join normalized n
  where p_exercise_type = 'kanji_reading'
    and p_kanji_word_id is not null
    and kw2.id_kanji = (select id_kanji from public.kanji_word where id = p_kanji_word_id)
    and v2.word = (
      select v3.word from public.kanji_word kw3
      join public.vocabulary v3 on v3.id = kw3.id_word
      where kw3.id = p_kanji_word_id
    )
    and kw2.id != p_kanji_word_id
    and p2.status not in ('new', 'suspended')
    and exists (
      select 1
      from unnest(array[v2.kana_reading, v2.romaji_reading] || coalesce(v2.other_readings, array[]::text[])) as r
      where r is not null and lower(trim(r)) = any(n.arr)
    );
$function$;

grant execute on function public.submit_review(uuid, text, smallint, bigint, bigint, bigint, bigint, bigint, text, bigint, bigint) to authenticated;
grant execute on function public.resolve_confirmed_siblings(uuid, text, bigint, bigint, bigint, text[]) to authenticated;
