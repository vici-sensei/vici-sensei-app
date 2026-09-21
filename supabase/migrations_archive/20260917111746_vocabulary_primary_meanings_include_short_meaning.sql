-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Prepends public.vocabulary.short_meaning (admin-curated <=3-4 word gloss, see
-- 20261213_vocabulary_short_meaning_column.sql) as the first element of primary_meanings wherever
-- primary_meanings is read, at the user's explicit request. Only 436/17093 study_enabled rows have
-- short_meaning populated (2.5%) -- every other row's primary_meanings is unaffected.
--
-- public.vocabulary_primary_meanings(v) centralizes the "prepend if present" logic as one helper so
-- every function below (and any future one) computes it the same way, instead of duplicating the
-- CASE inline nine times. short_meaning itself is untouched and stays the single source of truth --
-- nothing here writes it back into the stored primary_meanings column.
--
-- Per the user's explicit choices, this also changes behavior beyond display:
--   - search_vocabulary: short_meaning now counts toward search matching (scoring +
--     the ilike prefilter), not just the returned column -- searching "cat" now also finds a word
--     whose only match is its short_meaning.
--   - get_vocab_meaning_pool: short_meaning is now a valid vocab_meaning quiz answer/distractor
--     (feeds get_seen_vocab_meaning_cards, get_due_cards, complete_vocab_batch).
--
-- The three call sites that read public.vocabulary directly instead of through one of these RPCs
-- (lib/data/vocabulary.ts's fetchVocabularyDetail, lib/data/kanjiPractice.ts's
-- fetchSeenKanjiReading) get the equivalent merge done in TypeScript in the same change, since a
-- plain PostgREST select can't call this helper. lib/data/vocabPractice.ts and the rest of
-- lib/kanji/detailWords.ts already go through RPCs covered below, so they need no code change.

create or replace function public.vocabulary_primary_meanings(v public.vocabulary)
returns text[]
language sql
immutable
as $function$
  select case
    when v.short_meaning is not null then array[v.short_meaning] || v.primary_meanings
    else v.primary_meanings
  end;
$function$;

grant execute on function public.vocabulary_primary_meanings(public.vocabulary) to anon, authenticated, service_role;

create or replace function public.get_vocab_meaning_pool(p_word text, p_kana_reading text)
returns text[]
language sql
stable
as $function$
  select array_agg(distinct m)
  from (
    select unnest(public.vocabulary_primary_meanings(v)) as m
    from public.vocabulary v
    where v.word = p_word
      and v.kana_reading is not distinct from p_kana_reading

    union

    select om.gloss
    from public.vocabulary v
    cross join lateral jsonb_array_elements(coalesce(v.other_meanings, '[]'::jsonb)) as sense(value)
    cross join lateral jsonb_array_elements_text(sense.value) as om(gloss)
    where v.word = p_word
      and v.kana_reading is not distinct from p_kana_reading
  ) pool;
$function$;

create or replace function public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer)
 returns table(id bigint, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, parts_of_speech text[], ids_kanji bigint[], jlpt_level text, is_common_jisho boolean, usually_kana boolean, romaji_reading text, furiganas text[], romaji_furiganas text[], other_readings text[], total_count bigint)
 language sql
 stable
as $function$
  with params as (
    select
      nullif(p_query, '') as q,
      case
        when nullif(p_query, '') is null then null
        else replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_')
      end as q_escaped
  ),
  scored as (
    select
      v.*,
      dm.meanings as display_meanings,
      case
        when params.q is null then 0
        when lower(v.word) = lower(params.q) then 0
        when lower(v.kana_reading) = lower(params.q) or lower(v.romaji_reading) = lower(params.q)
          or exists (
            select 1 from unnest(coalesce(dm.meanings, '{}')) m where lower(m) = lower(params.q)
          )
          then 1
        when v.word ilike params.q_escaped || '%' escape '\'
          or v.kana_reading ilike params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(dm.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
          )
          then 2
        when v.word ilike '%' || params.q_escaped || '%' escape '\'
          or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
          then 3
        when exists (
          select 1 from unnest(coalesce(dm.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 4
        else null
      end as match_rank
    from public.vocabulary v
    cross join params
    cross join lateral (select public.vocabulary_primary_meanings(v) as meanings) dm
    where v.study_enabled
      and (
        p_level is null
        or v.jlpt_level = any(p_level)
        or (v.jlpt_level is null and '>N1' = any(p_level))
      )
      -- Mirrors "match_rank is not null" as literal ILIKE predicates (not hidden inside the
      -- CASE above) so the planner can push them down to the trigram indexes instead of
      -- sequential-scanning the whole table to evaluate the CASE per row. Each disjunct here is
      -- a superset of its corresponding CASE branch (substring implies prefix implies exact for
      -- the same column), so this never excludes a row the CASE would have ranked -- it only
      -- narrows the scan before the CASE re-derives the exact tier for ordering.
      and (
        params.q is null
        or v.word ilike '%' || params.q_escaped || '%' escape '\'
        or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
        or v.romaji_reading ilike params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(dm.meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, frequency_number desc, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, display_meanings as primary_meanings, other_meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, romaji_reading, furiganas, romaji_furiganas, other_readings,
         total_count
  from matches;
$function$;

create or replace function public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer)
returns table(id bigint, word text, kana_reading text, primary_meanings text[], parts_of_speech text[], jlpt_level text, usually_kana boolean, furiganas text[])
language sql
stable
as $function$
  select v.id, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and v.study_enabled
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
    )
  order by v.frequency_number desc, v.id asc
  limit p_limit;
$function$;

create or replace function public.get_kanji_detail_words(p_kanji_id bigint)
returns table(kanji_word_id bigint, reading_group integer, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, furiganas text[], jlpt_level text)
language sql
stable
as $function$
  select kw.id, kw.reading_group, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.other_meanings, v.furiganas, v.jlpt_level
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
    and v.study_enabled
  order by kdw.rank;
$function$;

create or replace function public.get_kanji_detail_words_batch(p_kanji_ids bigint[])
returns table(kanji_id bigint, kanji_word_id bigint, word text, primary_meanings text[], jlpt_level text, usually_kana boolean, furiganas text[])
language sql
stable
as $function$
  select kdw.kanji_id, kw.id, v.word, public.vocabulary_primary_meanings(v), v.jlpt_level, v.usually_kana, v.furiganas
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = any(p_kanji_ids)
    and v.study_enabled
  order by kdw.kanji_id, kdw.rank;
$function$;

create or replace function public.get_due_cards(
  p_user_id uuid,
  p_enabled_levels text[],
  p_include_kanji boolean,
  p_include_vocab boolean,
  p_include_hiragana boolean,
  p_include_katakana boolean,
  p_limit integer
)
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], primary_word_meanings text[], all_primary_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
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
         other_readings, furiganas, primary_word_meanings, all_primary_word_meanings, all_word_readings,
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
$function$;

create or replace function public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint)
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], primary_word_meanings text[], all_primary_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, primary_word_meanings, all_primary_word_meanings, all_word_readings,
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
$function$;

create or replace function public.complete_vocab_batch(p_user_id uuid)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 language sql
as $function$
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
    public.vocabulary_primary_meanings(v) as primary_word_meanings,
    public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
    null::text[] as all_word_readings,
    null::text[] as known_kanji_chars,
    null::text as kana_character, null::text as kana_romaji,
    f.status, f.ease_factor, f.interval_days, f.repetitions, f.lapses, f.learning_step
  from flipped f
  join public.vocabulary v on v.id = f.word_id
  order by f.id;
$function$;

create or replace function public.get_seen_vocab_meaning_cards(p_user_id uuid, p_enabled_levels text[])
returns table(
  word_id bigint,
  word text,
  kana_reading text,
  furiganas text[],
  primary_meanings text[],
  all_primary_word_meanings text[],
  jlpt_level text
)
language sql
stable
as $function$
  select p.word_id, v.word, v.kana_reading, v.furiganas, public.vocabulary_primary_meanings(v),
         public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
         v.jlpt_level
  from public.user_vocabulary_progress p
  join public.vocabulary v on v.id = p.word_id
  where p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pending_batch
    and v.study_enabled
    and v.jlpt_level = any(p_enabled_levels);
$function$;
