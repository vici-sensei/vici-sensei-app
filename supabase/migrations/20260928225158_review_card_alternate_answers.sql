-- Scope: both live projects (EU-new zrgcullndfhouencqqqc + US-new wftwdbiqnlqsvgpeypmb), identical text. Never the frozen project.
--
-- Review cards: data for "alternate" answers -- an answer that is real knowledge about the card, but
-- not what the card asks, gets a checkmark and the card asks again (same flow as a homograph's
-- sibling meaning/reading):
--   * kanji_meaning  <- a kun/on reading of the kanji          (needs kanji_readings)
--   * vocab_meaning  <- the word's reading                     (needs romaji_reading/other_readings,
--                                                               previously null on these rows)
--   * vocab_meaning  <- the meaning of one of the word's kanji (needs word_kanji)
--   * kanji_reading  <- the word's meaning                     (all_primary_word_meanings, previously null)
--   * kanji_reading  <- another reading of the tested kanji    (needs kanji_readings)
--
-- get_due_cards / complete_vocab_batch / get_kanji_intro_cards / get_seen_vocab_meaning_cards gain
-- the new columns AT THE END of their result, so a frontend deployed before this migration simply
-- never sees them (and one deployed after it, against a DB without it, treats them as absent).
-- Bodies are the baseline's, unchanged apart from the lines named above. Return types change, so each
-- function is dropped and re-created, and its baseline GRANTs re-applied.

begin;

-- Every kanji character of a word, in order of first appearance, with its meanings -- for the
-- vocab_meaning "that's what one of its kanji means" alternate. Matched by character rather than
-- through vocabulary.ids_kanji / kanji_word, so it doesn't depend on either being complete.
create or replace function public.vocabulary_word_kanji(p_word text) returns jsonb
    language sql stable
    as $$
  select jsonb_agg(jsonb_build_object('kanji', k.kanji, 'meanings', k.meanings) order by c.first_ord)
  from (
    select ch, min(ord) as first_ord
    from regexp_split_to_table(coalesce(p_word, ''), '') with ordinality as t(ch, ord)
    group by ch
  ) c
  join public.kanji k on k.kanji = c.ch
  where coalesce(cardinality(k.meanings), 0) > 0;
$$;

grant all on function public.vocabulary_word_kanji(text) to anon;
grant all on function public.vocabulary_word_kanji(text) to authenticated;
grant all on function public.vocabulary_word_kanji(text) to service_role;

drop function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer, text);

CREATE FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text DEFAULT NULL::text) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer, kanji_readings text[], word_kanji jsonb)
    LANGUAGE sql STABLE
    AS $$
  with eligible as (
    -- Which progress rows this user is served right now is decided ONLY by get_servable_due_rows
    -- (eligibility from get_eligible_due_rows, plus the daily cap on already-learned cards) -- the
    -- same helper get_today_activity_counts and get_next_due read, so /study's queue and the
    -- dashboard's counts can't disagree. Already bounded to the widest window this function ever
    -- serves (strict due_at <= now(), or the 10-minute learning grace below).
    select e.exercise_type, e.progress_id
    from public.get_servable_due_rows(p_user_id, p_enabled_levels, p_timezone) e
  ),
  candidates as (
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
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      coalesce(k.kun_readings, '{}'::text[]) || coalesce(k.on_readings, '{}'::text[]) as kanji_readings,
      null::jsonb as word_kanji
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'kanji_meaning')

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
      public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
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
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      coalesce(k.kun_readings, '{}'::text[]) || coalesce(k.on_readings, '{}'::text[]) as kanji_readings,
      null::jsonb as word_kanji
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'kanji_reading')

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      null::bigint, null::bigint,
      p.due_at,
      null::text, null::text[],
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      null::text[] as kanji_readings,
      public.vocabulary_word_kanji(v.word) as word_kanji
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'vocab_meaning')

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
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      null::text[] as kanji_readings,
      null::jsonb as word_kanji
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'hiragana_reading')

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
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      null::text[] as kanji_readings,
      null::jsonb as word_kanji
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'katakana_reading')
  ),
  -- Whether this user has anything genuinely due right now, across every candidate row above --
  -- the grace window (due_at between now() and now()+10min) only ever applies when this is false.
  has_strict as (
    select exists(select 1 from candidates c where c.due_at <= now()) as strict_exists
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
         coalesce(status = 'learning' and drill_enabled, false) as drill_mode,
         status, ease_factor, interval_days, repetitions, lapses, learning_step,
         kanji_readings, word_kanji
  from candidates, has_strict
  where has_strict.strict_exists = false or candidates.due_at <= now()
  order by candidates.due_at asc
  limit p_limit;
$$;

GRANT ALL ON FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text) TO anon;
GRANT ALL ON FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text) TO authenticated;
GRANT ALL ON FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text) TO service_role;

drop function public.complete_vocab_batch(uuid);

CREATE FUNCTION public.complete_vocab_batch(p_user_id uuid) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer, kanji_readings text[], word_kanji jsonb)
    LANGUAGE sql
    AS $$
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
    v.romaji_reading, v.other_readings,
    v.furiganas,
    v.usually_kana,
    public.vocabulary_primary_meanings(v) as primary_word_meanings,
    public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
    null::text[] as all_word_readings,
    null::text[] as known_kanji_chars,
    null::text as kana_character, null::text as kana_romaji,
    f.status, f.ease_factor, f.interval_days, f.repetitions, f.lapses, f.learning_step,
    null::text[] as kanji_readings,
    public.vocabulary_word_kanji(v.word) as word_kanji
  from flipped f
  join public.vocabulary v on v.id = f.word_id
  order by f.id;
$$;

GRANT ALL ON FUNCTION public.complete_vocab_batch(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.complete_vocab_batch(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.complete_vocab_batch(p_user_id uuid) TO service_role;

drop function public.get_kanji_intro_cards(uuid, bigint);

CREATE FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer, kanji_readings text[], word_kanji jsonb)
    LANGUAGE sql STABLE
    AS $$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji,
         status, ease_factor, interval_days, repetitions, lapses, learning_step,
         kanji_readings, word_kanji
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
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      coalesce(k.kun_readings, '{}'::text[]) || coalesce(k.on_readings, '{}'::text[]) as kanji_readings,
      null::jsonb as word_kanji
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
      public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
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
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      coalesce(k.kun_readings, '{}'::text[]) || coalesce(k.on_readings, '{}'::text[]) as kanji_readings,
      null::jsonb as word_kanji
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
$$;

GRANT ALL ON FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) TO anon;
GRANT ALL ON FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint) TO service_role;

drop function public.get_seen_vocab_meaning_cards(uuid, text[]);

CREATE FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) RETURNS TABLE(word_id bigint, word text, kana_reading text, furiganas text[], primary_meanings text[], all_primary_word_meanings text[], jlpt_level text, usually_kana boolean, romaji_reading text, other_readings text[], word_kanji jsonb)
    LANGUAGE sql STABLE
    AS $$
  select p.word_id, v.word, v.kana_reading, v.furiganas, public.vocabulary_primary_meanings(v),
         public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
         v.jlpt_level, v.usually_kana,
         v.romaji_reading, v.other_readings, public.vocabulary_word_kanji(v.word) as word_kanji
  from public.user_vocabulary_progress p
  join public.vocabulary v on v.id = p.word_id
  where p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pending_batch
    and v.study_enabled
    and v.jlpt_level = any(p_enabled_levels);
$$;

GRANT ALL ON FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) TO anon;
GRANT ALL ON FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[]) TO service_role;

notify pgrst, 'reload schema';

commit;
