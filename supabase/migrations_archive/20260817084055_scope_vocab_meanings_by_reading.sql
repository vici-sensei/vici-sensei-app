-- get_due_cards' vocab_meaning branch aggregates all_word_meanings across
-- every public.vocabulary row sharing the same word, so students aren't
-- penalized for writing a sense that lives on a sibling row (e.g. "collar"
-- for the row backing "color/colour" -- both are カラー). But that aggregation
-- ignored kana_reading, so it also merged meanings across rows that are the
-- same word with a genuinely different reading (e.g. 中 read なか vs ちゅう
-- have unrelated meanings and must stay separate). Scope the aggregation to
-- rows that also share kana_reading -- "is not distinct from" so two NULL
-- readings still match each other, consistent with how the rest of the
-- get_due_cards query treats kana_reading.

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
  all_word_meanings text[],
  all_word_readings text[],
  known_kanji_chars text[],
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
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
         known_kanji_chars,
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
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
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
