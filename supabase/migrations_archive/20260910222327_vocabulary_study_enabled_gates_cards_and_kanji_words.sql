-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- vocabulary.study_enabled (20261026_vocabulary_study_enabled_column.sql) was added but nothing
-- ever read it yet -- unlike hiragana.study_enabled/katakana.study_enabled, which
-- get_new_hiragana_candidates/get_new_katakana_candidates already gate on. This wires it up the
-- same way, plus the one thing kana's study_enabled never had to deal with: vocabulary rows are
-- also selected as the "example word" for a kanji's reading card (kanji_word/kanji_detail_words),
-- so a disabled word needs to stop being choosable there too, not just as its own vocab_meaning
-- card.
--
-- Four places read/select vocabulary for the standard track's study pipeline:
--
-- 1. get_new_vocab_candidates -- offers a word as new vocabulary to introduce. Gains
--    `and v.study_enabled`, same shape as the kana candidate functions.
--
-- 2. get_due_cards / get_kanji_intro_cards -- surface already-in-progress cards. Unlike kana (where
--    study_enabled only ever gates NEW introduction -- see 20260906_mastery_denominators_respect_
--    study_enabled.sql's postmortem), a word can be disabled after a user already has a
--    user_vocabulary_progress or user_kanji_reading_progress row pointing at it, and the ask here is
--    to stop showing that card too, not just freeze it going forward. Both functions' vocab_meaning
--    and kanji_reading branches join public.vocabulary directly, so both gain `and v.study_enabled`.
--
-- 3. get_kanji_detail_words / get_kanji_detail_words_batch -- read the precomputed
--    kanji_detail_words table (built by rebuild_kanji_detail_words, below) to seed a newly
--    introduced kanji's reading cards and to preview its example words before that. Read-time
--    `and v.study_enabled` here is defense-in-depth for the gap between a word being disabled and
--    the next manual rebuild -- see next point.
--
-- 4. rebuild_kanji_detail_words -- the actual selection logic that decides which word "belongs" to
--    which kanji. This is the real fix for "don't select this word as a kanji's associated word
--    anymore": the scored CTE's join to vocabulary now requires study_enabled, so a disabled word
--    can never be picked as a champion or fill-in again, and (per every prior migration that's
--    touched this function) the migration ends by calling it so the live table picks up the change
--    immediately instead of waiting for the next unrelated rebuild.
--
-- Not touched: get_level_progress's vocabulary/kanji_reading denominators and get_new_card_caps'
-- vocab_total still count every row regardless of study_enabled. That's the same
-- would-need-the-mastery_denominators-treatment gap 20260906_mastery_denominators_respect_
-- study_enabled.sql fixed for kana, just not yet done for vocabulary -- left alone here since it
-- affects /progress and settings, not the /study card queue this change is scoped to.

create or replace function public.get_new_vocab_candidates(
  p_user_id uuid,
  p_enabled_levels text[],
  p_limit integer
)
returns table (
  id bigint,
  word text,
  kana_reading text,
  meanings text[],
  parts_of_speech text[],
  jlpt_level text,
  usually_kana boolean,
  furiganas text[]
)
language sql
stable
as $function$
  select v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.jlpt_level,
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
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
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
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
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
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
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
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
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

create or replace function public.get_kanji_detail_words(p_kanji_id bigint)
returns table(kanji_word_id bigint, reading_group integer, word text, kana_reading text, meanings text[], furiganas text[], jlpt_level text)
language sql
stable
as $function$
  select kw.id, kw.reading_group, v.word, v.kana_reading, v.meanings, v.furiganas, v.jlpt_level
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
    and v.study_enabled
  order by kdw.rank;
$function$;

create or replace function public.get_kanji_detail_words_batch(p_kanji_ids bigint[])
returns table(kanji_id bigint, kanji_word_id bigint, word text, meanings text[], jlpt_level text, usually_kana boolean, furiganas text[])
language sql
stable
as $function$
  select kdw.kanji_id, kw.id, v.word, v.meanings, v.jlpt_level, v.usually_kana, v.furiganas
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = any(p_kanji_ids)
    and v.study_enabled
  order by kdw.kanji_id, kdw.rank;
$function$;

create or replace function public.rebuild_kanji_detail_words()
returns void
language plpgsql
as $function$
begin
  truncate table public.kanji_detail_words;

  insert into public.kanji_detail_words (kanji_id, kanji_word_id, rank)
  with params as (
    select array['N5', 'N4', 'N3', 'N2', 'N1']::text[] as v_order
  ),
  kanji_rank as (
    select k.id as kanji_id,
           coalesce(array_position(p.v_order, k.level), 6) as lvl_rank
    from public.kanji k
    cross join params p
  ),
  scored as (
    select
      kw.id_kanji as kanji_id,
      kw.id as kanji_word_id,
      kw.reading_group,
      v.word,
      coalesce(v.frequency_number, 0) as freq_score,
      case
        when wr.word_rank <= kr.lvl_rank
        then
          case when v.is_common_jisho = true then 1 else 2 end
        else 3
      end as tier,
      greatest(wr.word_rank - kr.lvl_rank, 0) as level_gap
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word and v.study_enabled
    cross join params p
    join kanji_rank kr on kr.kanji_id = kw.id_kanji
    cross join lateral (
      select coalesce(array_position(p.v_order, v.jlpt_level), 6) as word_rank
    ) wr
  ),
  deduped as (
    select distinct on (kanji_id, word)
      kanji_id, kanji_word_id, reading_group, tier, level_gap, freq_score
    from scored
    order by kanji_id, word, tier asc, level_gap asc, freq_score desc, kanji_word_id asc
  ),
  group_sizes as (
    select kanji_id, reading_group, count(*) as group_size
    from deduped
    group by kanji_id, reading_group
  ),
  group_rank as (
    select
      kanji_id, reading_group, group_size,
      row_number() over (
        partition by kanji_id
        order by group_size desc, reading_group asc nulls last
      ) as size_rank
    from group_sizes
  ),
  selected_groups as (
    -- A group is "big enough" to contribute its own champion when it's
    -- among the kanji's 3 largest groups, or when it has >=3 words outright
    -- (so kanji with more than 3 genuinely big groups still keep all of them).
    select kanji_id, reading_group
    from group_rank
    where size_rank <= 3 or group_size >= 3
  ),
  group_champions as (
    select distinct on (s.kanji_id, s.reading_group)
      s.kanji_id, s.kanji_word_id, s.reading_group, s.tier, s.level_gap, s.freq_score
    from deduped s
    join selected_groups sg
      on sg.kanji_id = s.kanji_id
     and sg.reading_group is not distinct from s.reading_group
    order by s.kanji_id, s.reading_group nulls last, s.tier asc, s.level_gap asc, s.freq_score desc, s.kanji_word_id asc
  ),
  champion_count as (
    select kanji_id, count(*) as n from group_champions group by kanji_id
  ),
  ranked_fill_ins as (
    select
      s.*,
      row_number() over (
        partition by s.kanji_id
        order by s.reading_group nulls last, s.tier asc, s.level_gap asc, s.freq_score desc, s.kanji_word_id asc
      ) as rn
    from deduped s
    where not exists (
      select 1 from group_champions c
      where c.kanji_word_id = s.kanji_word_id and c.kanji_id = s.kanji_id
    )
  ),
  fill_ins as (
    -- Only kicks in when the kanji doesn't have 3 distinct reading_groups to
    -- begin with (fewer than 3 groups were selected above) -- same
    -- leftover-candidate fallback as before, now against group_champions
    -- instead of best_per_group.
    select
      r.kanji_id, r.kanji_word_id, r.reading_group, r.tier, r.level_gap, r.freq_score
    from ranked_fill_ins r
    join champion_count cc on cc.kanji_id = r.kanji_id
    where cc.n < 3
      and r.rn <= (3 - cc.n)
  ),
  combined as (
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, freq_score from group_champions
    union all
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, freq_score from fill_ins
  )
  select
    kanji_id,
    kanji_word_id,
    row_number() over (
      partition by kanji_id
      order by reading_group nulls last, tier asc, level_gap asc, freq_score desc, kanji_word_id asc
    ) as rank
  from combined;
end;
$function$;

SELECT public.rebuild_kanji_detail_words();
