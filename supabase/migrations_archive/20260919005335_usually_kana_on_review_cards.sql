-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Exposes vocabulary.usually_kana on the three RPCs that feed the review cards and the free
-- practice pool, so the UI can show a usually-kana word as its kana reading (no furigana), the
-- way NewVocabIntroCard already does for get_new_vocab_candidates:
--   get_due_cards                 -> vocab_meaning / kanji_reading cards on /study
--   complete_vocab_batch          -> the vocab_meaning cards released when a new-vocab batch completes
--   get_seen_vocab_meaning_cards  -> the vocab_meaning pool on /study/practice
-- usually_kana is a new output column: right after furiganas in get_due_cards/complete_vocab_batch
-- (null for kanji_meaning and kana cards), last in get_seen_vocab_meaning_cards; apart from that
-- each function is identical to the live definition. The RETURNS TABLE shape
-- changes, so each function is dropped and recreated (CREATE OR REPLACE cannot change it) inside
-- one transaction; none of them is referenced by another function. The old client ignores the
-- extra column, and the new client treats a missing usually_kana as false, so client and DB can
-- be deployed in either order.

begin;

drop function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer);
drop function public.complete_vocab_batch(uuid);
drop function public.get_seen_vocab_meaning_cards(uuid, text[]);

CREATE OR REPLACE FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 LANGUAGE sql
 STABLE
AS $function$
  with settings as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana
    from public.user_study_settings
    where user_id = p_user_id
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
         coalesce(status = 'learning' and drill_enabled, false) as drill_mode,
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
      null::boolean as usually_kana,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
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
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
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
          and (
            exists (
              select 1
              from public.kanji_word kw3
              join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
              where kw3.id_kanji = kw2.id_kanji
                and kw3.reading_group = kw2.reading_group
                and p3.user_id = p_user_id
                and p3.status = 'review'
                and p3.repetitions >= 2
            )
            or (
              k2.level is not null
              and k.level is not null
              and array_position(array['N5','N4','N3','N2','N1'], k2.level)
                < array_position(array['N5','N4','N3','N2','N1'], k.level)
            )
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
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
      and v.study_enabled

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
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
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
      and v.study_enabled

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
      null::boolean,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji, h.kana_type,
      h.drill_enabled,
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
      null::boolean,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji, k.kana_type,
      k.drill_enabled,
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
$function$
;

CREATE OR REPLACE FUNCTION public.complete_vocab_batch(p_user_id uuid)
 RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 LANGUAGE sql
AS $function$
  with flipped as (
    update public.user_vocabulary_progress
    set pending_batch = false, due_at = now()
    where user_id = p_user_id
      and pending_batch = true
    returning id, word_id, status, ease_factor, interval_days, repetitions, lapses, learning_step
  )
  select
    'vocab_meaning'::text as exercise_type,
    f.id as progress_id,
    null::bigint as kanji_id, f.word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    v.word, v.kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    v.furiganas,
    v.usually_kana,
    public.vocabulary_primary_meanings(v) as primary_word_meanings,
    public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
    null::text[] as all_word_readings,
    null::text[] as known_kanji_chars,
    null::text as kana_character, null::text as kana_romaji,
    f.status, f.ease_factor, f.interval_days, f.repetitions, f.lapses, f.learning_step
  from flipped f
  join public.vocabulary v on v.id = f.word_id
  order by f.id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[])
 RETURNS TABLE(word_id bigint, word text, kana_reading text, furiganas text[], primary_meanings text[], all_primary_word_meanings text[], jlpt_level text, usually_kana boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select p.word_id, v.word, v.kana_reading, v.furiganas, public.vocabulary_primary_meanings(v),
         public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
         v.jlpt_level, v.usually_kana
  from public.user_vocabulary_progress p
  join public.vocabulary v on v.id = p.word_id
  where p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pending_batch
    and v.study_enabled
    and v.jlpt_level = any(p_enabled_levels);
$function$
;

grant execute on function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer) to anon, authenticated, service_role;
grant execute on function public.complete_vocab_batch(p_user_id uuid) to anon, authenticated, service_role;
grant execute on function public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) to anon, authenticated, service_role;

commit;

-- PostgREST caches function signatures; refresh it so the new column shows up right away.
notify pgrst, 'reload schema';
