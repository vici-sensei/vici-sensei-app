-- The "Vocabulary" card (vocab_meaning) now hides furigana until the card is revealed (see
-- ReviewCardVocabMeaning) -- otherwise a student can read the word aloud from its kana and
-- recall the meaning by sound alone, never actually recognizing the kanji, which defeats the
-- point of this card (unlike "Word reading", which tests the reading directly and can afford to
-- show it).
--
-- That changes what counts as a fair "sibling" answer. 20260817_scope_vocab_meanings_by_reading.sql
-- deliberately scoped all_word_meanings to rows sharing this row's kana_reading, specifically
-- because furigana was visible at the time -- a student who typed the meaning of a different
-- reading of the same written word (e.g. 中 read ちゅう instead of the なか being tested) had
-- genuinely made a mistake, since the furigana told them which reading was intended.
--
-- Now that furigana is hidden until reveal, that's no longer a fair assumption: the student has
-- no way to tell which reading is being tested from the kanji alone, so a cross-reading guess is
-- exactly as legitimate as a same-reading sibling guess. This drops the kana_reading scoping,
-- aggregating meanings across every vocabulary row sharing just the word -- mirroring how
-- all_word_readings (used by "Word reading") already aggregates across every reading of a word,
-- for the same reason. checkVocabMeaningAnswer already treats anything in all_word_meanings that
-- isn't this row's own word_meanings as "alternate" (credited, but doesn't end the review) --
-- no client-side change needed, it was already built to handle a broader pool than this.
--
-- Two functions compute all_word_meanings for vocab_meaning cards: get_due_cards (the normal due
-- queue) and complete_vocab_batch (flushing a pending new-vocab batch) -- both need the same fix
-- or a batch-flushed card would grade more strictly than an ordinary due one.

create or replace function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
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

create or replace function public.complete_vocab_batch(p_user_id uuid)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
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
    v.meanings as word_meanings,
    (
      select array_agg(distinct m)
      from (
        select unnest(v2.meanings) as m
        from public.vocabulary v2
        where v2.word = v.word
      ) meanings
    ) as all_word_meanings,
    null::text[] as all_word_readings,
    null::text[] as known_kanji_chars,
    null::text as kana_character, null::text as kana_romaji,
    f.status, f.ease_factor, f.interval_days, f.repetitions, f.lapses, f.learning_step
  from flipped f
  join public.vocabulary v on v.id = f.word_id
  order by f.id;
$function$;

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.complete_vocab_batch(uuid) to authenticated;
