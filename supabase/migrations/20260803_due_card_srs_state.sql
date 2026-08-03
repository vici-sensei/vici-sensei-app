-- Run this manually in the Supabase SQL editor.
--
-- 20260802_reduce_overfetching.sql dropped status/ease_factor/interval_days/
-- repetitions/lapses/learning_step from get_due_cards because no component
-- read them. GET /api/study/queue now needs them again server-side (not sent
-- to the client) to preview what each rating button ("Hard"/"Good"/"Easy")
-- would actually do to a given card's schedule -- see lib/srs/scheduler.ts's
-- previewRatingLabels. Re-adds the six columns; DueCard itself stays trimmed,
-- the route computes rating_previews and drops the raw fields before responding.

drop function if exists public.get_due_cards(uuid, text[], boolean, boolean, integer, timestamptz);

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
  kanji_char text,
  kanji_meanings text[],
  word text,
  kana_reading text,
  romaji_reading text,
  other_readings text[],
  furiganas text[],
  word_meanings text[],
  status text,
  ease_factor numeric,
  interval_days integer,
  repetitions integer,
  lapses integer,
  learning_step integer
)
language sql
stable
as $$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      p.due_at,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::text[] as word_meanings,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
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
      p.due_at,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      null::text[] as word_meanings,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
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
      p.due_at,
      null::text, null::text[],
      v.word, v.kana_reading,
      null::text, null::text[],
      v.furiganas,
      v.meanings as word_meanings,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
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
