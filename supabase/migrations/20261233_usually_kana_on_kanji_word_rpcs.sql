-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Exposes vocabulary.usually_kana on the two RPCs that hand a kanji's example words to the UI, so the UI
-- can mark a usually_kana word that is shown in kanji form (UsuallyKanaNote, "usually written in kana"):
--   get_kanji_detail_words  -> "Example words" on the Browse kanji detail page
--   get_kanji_intro_cards   -> the Word reading cards bundled with a newly introduced kanji
-- Since 20261232 a kanji whose only candidate words are usually_kana (52 kanji) falls back to those words,
-- shown in kanji form on purpose because they are the kanji's only examples; every other kanji never
-- lists a usually_kana word. usually_kana is a new output column (last in get_kanji_detail_words, right
-- after furiganas in get_kanji_intro_cards, null for its kanji_meaning row); each function is otherwise
-- identical to the live definition. The RETURNS TABLE shape changes, so each is dropped and recreated in
-- one transaction. introduce_kanji calls get_kanji_detail_words but only reads kanji_word_id, so it is
-- unaffected. The old client ignores the extra column and the new client treats a missing usually_kana as
-- false, so client and DB can be deployed in either order.

begin;

drop function public.get_kanji_detail_words(bigint);
drop function public.get_kanji_intro_cards(uuid, bigint);

CREATE OR REPLACE FUNCTION public.get_kanji_detail_words(p_kanji_id bigint)
 RETURNS TABLE(kanji_word_id bigint, reading_group integer, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, furiganas text[], jlpt_level text, usually_kana boolean)
 LANGUAGE sql
 STABLE
AS $function$
  select kw.id, kw.reading_group, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.other_meanings, v.furiganas, v.jlpt_level, v.usually_kana
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
    and v.study_enabled
  order by kdw.rank;
$function$
;

CREATE OR REPLACE FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint)
 RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 LANGUAGE sql
 STABLE
AS $function$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji,
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
      0 as ord,
      0 as sub_ord,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::boolean as usually_kana,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
      and p.kanji_id = p_kanji_id
      and p.status != 'suspended'

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      1 as ord,
      coalesce(kdw.rank, 0) as sub_ord,
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
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    left join public.kanji_detail_words kdw on kdw.kanji_word_id = kw.id and kdw.kanji_id = p.kanji_id
    where p.user_id = p_user_id
      and p.kanji_id = p_kanji_id
      and p.status != 'suspended'
      and v.study_enabled
  ) cards
  order by ord, sub_ord;
$function$
;

grant execute on function public.get_kanji_detail_words(p_kanji_id bigint) to anon, authenticated, service_role;
grant execute on function public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) to anon, authenticated, service_role;

commit;

-- PostgREST caches function signatures; refresh it so the new column shows up right away.
notify pgrst, 'reload schema';
