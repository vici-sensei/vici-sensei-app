-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Exposes user_hiragana_progress.drill_streak/user_katakana_progress.drill_streak (added by
-- 20260827_hiragana_katakana_drill.sql) through get_due_cards/get_hiragana_reading_cards/
-- get_katakana_reading_cards, so ReviewCardKanaReading can show "how many in a row so far" on
-- the current card the instant it's fetched/resumed -- not just after the next
-- record_hiragana_drill_result/record_katakana_drill_result round trip, which only happens once
-- the user already advances past the card. null for every non-kana row.
--
-- Each function is dropped before being recreated -- Postgres refuses CREATE OR REPLACE when the
-- OUT/returns-table column list changes shape (adding drill_streak here), same as
-- 20260822_kana_rpcs.sql already had to do for get_due_cards' own earlier signature change.

drop function if exists public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer);
drop function if exists public.get_hiragana_reading_cards(uuid, bigint[]);
drop function if exists public.get_katakana_reading_cards(uuid, bigint[]);

create or replace function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, drill_streak integer, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
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
         known_kanji_chars, kana_character, kana_romaji, drill_streak,
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
      null::text as kana_character, null::text as kana_romaji,
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
      null::text as kana_character, null::text as kana_romaji,
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
      null::text as kana_character, null::text as kana_romaji,
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
      h.character as kana_character, h.romaji as kana_romaji,
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
      k.character as kana_character, k.romaji as kana_romaji,
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
  ) due
  order by due_at asc
  limit p_limit;
$function$;

create or replace function public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, drill_streak integer,
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
    h.character as kana_character, h.romaji as kana_romaji, p.drill_streak,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_hiragana_ids) with ordinality as ids(hiragana_id, ord)
  join public.user_hiragana_progress p on p.user_id = p_user_id and p.hiragana_id = ids.hiragana_id
  join public.hiragana h on h.id = p.hiragana_id
  where p.status != 'suspended'
  order by ids.ord;
$function$;

create or replace function public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, drill_streak integer,
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
    k.character as kana_character, k.romaji as kana_romaji, p.drill_streak,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_katakana_ids) with ordinality as ids(katakana_id, ord)
  join public.user_katakana_progress p on p.user_id = p_user_id and p.katakana_id = ids.katakana_id
  join public.katakana k on k.id = p.katakana_id
  where p.status != 'suspended'
  order by ids.ord;
$function$;

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.get_hiragana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.get_katakana_reading_cards(uuid, bigint[]) to authenticated;
