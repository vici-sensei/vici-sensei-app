-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- ReviewCardVocabMeaning now shows furigana above the word, so get_due_cards
-- needs to return vocabulary.furiganas for vocab_meaning cards too (it
-- already does for kanji_reading, see 20260731_kanji_reading_furigana.sql).
-- Return columns are unchanged, so CREATE OR REPLACE is enough here.

create or replace function public.get_due_cards(
  p_user_id uuid,
  p_enabled_levels text[],
  p_include_kanji boolean,
  p_include_vocab boolean,
  p_limit integer,
  p_as_of timestamptz default now()
)
returns table (
  exercise_type text,
  progress_id bigint,
  kanji_id bigint,
  word_id bigint,
  kanji_word_id bigint,
  status text,
  due_at timestamptz,
  ease_factor numeric,
  interval_days integer,
  repetitions integer,
  lapses integer,
  learning_step integer,
  kanji_char text,
  kanji_meanings text[],
  word text,
  kana_reading text,
  romaji_reading text,
  other_readings text[],
  furiganas text[]
)
language sql
stable
as $$
  select * from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      p.status, p.due_at, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p_include_kanji
      and p.user_id = p_user_id
      and p.due_at <= p_as_of
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      p.status, p.due_at, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    where p_include_kanji
      and p.user_id = p_user_id
      and p.due_at <= p_as_of
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      p.status, p.due_at, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      null::text, null::text[],
      v.word, v.kana_reading,
      null::text, null::text[],
      v.furiganas
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p_include_vocab
      and p.user_id = p_user_id
      and p.due_at <= p_as_of
      and p.status != 'suspended'
      and v.jlpt_level = any(p_enabled_levels)
  ) due
  order by due_at asc
  limit p_limit;
$$;

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, integer, timestamptz) to authenticated;
