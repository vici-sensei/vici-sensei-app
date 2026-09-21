-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Two independent hardening changes, bundled since both continue today's "stop trusting the
-- client to keep two independent computations in sync" theme:
--
-- 1. drill_mode: whether a hiragana_reading/katakana_reading row is still in the
--    post-introduction drill (repeat until 3 correct in a row -- see
--    20260827_hiragana_katakana_drill.sql, scoped to kana_type = 'seion' by
--    20260906_selective_examples_and_seion_only_drill.sql) used to be recomputed independently
--    in two different client files from the same raw status/kana_type fields: once in
--    ReviewCardKanaReading.tsx (to decide which UI to render) and once in useStudyQueue.ts's
--    rate() (to decide whether to route the answer through submitDrillAnswer or the normal
--    submit_review flow). Those two copies had already drifted once -- rate() was missing the
--    kana_type = 'seion' condition, silently routing a normal Hard/Good/Easy-rated
--    dakuten/yoon/etc. card into the drill (no review_logs row, no real SM-2 scheduling, stuck
--    needing 3 "good enough" answers instead of one). Exposing the already-computed boolean
--    directly on the row means both call sites read the same value instead of re-deriving the
--    same rule and risking it diverging again.
--
-- 2. undo_review: undoReview (lib/data/reviews.ts) used to run entirely client-side as two
--    separate, non-atomic writes -- a SELECT on review_logs, then an UPDATE restoring the
--    *_before snapshot onto the right progress table, then a second UPDATE marking the log
--    undone -- with no transaction tying them together. A client that drops connection between
--    the two UPDATEs leaves the progress row restored but the log still undone = false (so a
--    later undo attempt, or the "latest review" lookup, can act on stale state), and two
--    concurrent undo calls (double-click, or a second tab) can both read the same snapshot and
--    race to write it. Moved into one atomic RPC, locked per user, exactly like submit_review.

-- ---------------------------------------------------------------------------
-- 1a. get_due_cards: add drill_mode. Return shape changes, so dropped and recreated.
-- ---------------------------------------------------------------------------
drop function if exists public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer);

create function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 language sql
 stable
as $function$
  with settings as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana
    from public.user_study_settings
    where user_id = p_user_id
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
         coalesce(status = 'learning' and kana_type = 'seion', false) as drill_mode,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      null::bigint as hiragana_id,
      null::bigint as katakana_id,
      p.due_at,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      p.due_at,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      (
        select array_agg(distinct r)
        from (
          select v2.kana_reading as r from public.vocabulary v2 where v2.word = v.word and v2.kana_reading is not null
          union
          select v2.romaji_reading from public.vocabulary v2 where v2.word = v.word and v2.romaji_reading is not null
          union
          select unnest(v2.other_readings) from public.vocabulary v2 where v2.word = v.word
        ) readings
      ) as all_word_readings,
      (
        select array_agg(distinct k2.kanji)
        from public.kanji_word kw2
        join public.kanji k2 on k2.id = kw2.id_kanji
        where kw2.id_word = v.id
          and kw2.id_kanji != p.kanji_id
          and exists (
            select 1
            from public.kanji_word kw3
            join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
            where kw3.id_kanji = kw2.id_kanji
              and kw3.reading_group = kw2.reading_group
              and p3.user_id = p_user_id
              and p3.status = 'review'
              and p3.repetitions >= 2
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      null::bigint, null::bigint,
      p.due_at,
      null::text, null::text[],
      v.word, v.kana_reading,
      null::text, null::text[],
      v.furiganas,
      v.meanings as word_meanings,
      (
        select array_agg(distinct m)
        from (
          select unnest(v2.meanings) as m
          from public.vocabulary v2
          where v2.word = v.word
            and v2.kana_reading is not distinct from v.kana_reading
        ) meanings
      ) as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_vocabulary
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pending_batch
      and v.jlpt_level = any(p_enabled_levels)

    union all

    select
      'hiragana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      p.hiragana_id, null::bigint,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji, h.kana_type,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_hiragana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pack_pending

    union all

    select
      'katakana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      null::bigint, p.katakana_id,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji, k.kana_type,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_katakana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pack_pending
  ) due
  order by due_at asc
  limit p_limit;
$function$;

-- ---------------------------------------------------------------------------
-- 1b. get_hiragana_reading_cards/get_katakana_reading_cards: same drill_mode addition.
-- ---------------------------------------------------------------------------
drop function if exists public.get_hiragana_reading_cards(uuid, bigint[]);

create function public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select
    'hiragana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    p.hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    h.character as kana_character, h.romaji as kana_romaji, h.kana_type, p.drill_streak,
    (p.status = 'learning' and h.kana_type = 'seion') as drill_mode,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_hiragana_ids) with ordinality as ids(hiragana_id, ord)
  join public.user_hiragana_progress p on p.user_id = p_user_id and p.hiragana_id = ids.hiragana_id
  join public.hiragana h on h.id = p.hiragana_id
  where p.status != 'suspended'
    and not p.pack_pending
  order by ids.ord;
$function$;

drop function if exists public.get_katakana_reading_cards(uuid, bigint[]);

create function public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select
    'katakana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, p.katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    k.character as kana_character, k.romaji as kana_romaji, k.kana_type, p.drill_streak,
    (p.status = 'learning' and k.kana_type = 'seion') as drill_mode,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_katakana_ids) with ordinality as ids(katakana_id, ord)
  join public.user_katakana_progress p on p.user_id = p_user_id and p.katakana_id = ids.katakana_id
  join public.katakana k on k.id = p.katakana_id
  where p.status != 'suspended'
    and not p.pack_pending
  order by ids.ord;
$function$;

-- ---------------------------------------------------------------------------
-- 2. undo_review: atomic replacement for the client-orchestrated select + 2 updates.
--    p_review_log_id null means "undo the most recent not-yet-undone review", matching
--    undoReview's existing default-argument behavior.
-- ---------------------------------------------------------------------------
create or replace function public.undo_review(p_user_id uuid, p_review_log_id bigint default null)
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

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.get_hiragana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.get_katakana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.undo_review(uuid, bigint) to authenticated;
