-- Run this manually in the Supabase SQL editor.
--
-- Trims four RPCs down to the columns the app actually reads, found during an
-- audit of over-fetching across the study/browse flows:
--
-- 1. get_due_cards: drops status/ease_factor/interval_days/repetitions/
--    lapses/learning_step (never read by any review card component — status
--    filtering already happens in the WHERE clause, and due_at is still used
--    internally for ORDER BY but no longer projected). Adds word_meanings
--    (vocabulary.meanings) for vocab_meaning rows so
--    ReviewCardVocabMeaning.tsx no longer needs a per-card follow-up fetch to
--    /api/vocabulary/{id} just to read the word's meanings.
-- 2. get_kanji_detail_words: drops word_id/parts_of_speech/ids_kanji/
--    is_common_jisho/usually_kana/frequency/romaji_reading/furiganas/
--    romaji_furiganas/other_readings -- the browse kanji detail page only
--    renders word/kana_reading/meanings/reading_number, and
--    /api/study/kanji/introduce only reads kanji_word_id from this RPC.
-- 3. get_kanji_detail_words_batch: same trim, but keeps furiganas/
--    usually_kana/jlpt_level instead of kana_reading, since NewKanjiIntroCard
--    (the only caller, via /api/study/queue) renders those instead.
-- 4. get_new_vocab_candidates: drops ids_kanji/is_common_jisho/frequency/
--    romaji_reading/romaji_furiganas/other_readings -- NewVocabIntroCard only
--    renders word/kana_reading/meanings/parts_of_speech/jlpt_level/
--    usually_kana/furiganas.
--
-- All four change their RETURNS TABLE shape, so each needs DROP FUNCTION
-- before CREATE OR REPLACE (matches the precedent in
-- 20260724_kanji_detail_words.sql / 20260724_drop_priority_score.sql).

-- 1. get_due_cards --------------------------------------------------------

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
  word_meanings text[]
)
language sql
stable
as $$
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings
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
      null::text[] as word_meanings
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
      null::text[] as word_meanings
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
      v.meanings as word_meanings
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

-- 2. get_kanji_detail_words ------------------------------------------------

drop function if exists public.get_kanji_detail_words(bigint);

create or replace function public.get_kanji_detail_words(p_kanji_id bigint)
 returns table(
   kanji_word_id bigint,
   reading_number integer,
   word text,
   kana_reading text,
   meanings text[]
 )
 language sql
 stable
as $function$
  with params as (
    select array['N5', 'N4', 'N3', 'N2', 'N1']::text[] as v_order
  ),
  kanji_rank as (
    select coalesce(array_position(p.v_order, regexp_replace(k.level, '\*$', '')), 6) as rank
    from public.kanji k
    cross join params p
    where k.id = p_kanji_id
  ),
  scored as (
    select
      kw.id as kanji_word_id,
      kw.reading_number,
      v.id as word_id,
      v.word,
      v.kana_reading,
      v.meanings,
      v.jlpt_level,
      v.is_common_jisho,
      v.frequency,
      case v.frequency
        when 'high' then 4
        when 'normal' then 3
        when 'low' then 2
        when 'lowest' then 1
        else 0
      end as freq_score,
      case
        when wr.word_rank <= kr.rank
        then
          case when v.is_common_jisho = true then 1 else 2 end
        else 3
      end as tier,
      greatest(wr.word_rank - kr.rank, 0) as level_gap,
      case when v.jlpt_level like '%*' then 1 else 0 end as starred
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word
    cross join params p
    cross join kanji_rank kr
    cross join lateral (
      select coalesce(array_position(p.v_order, regexp_replace(v.jlpt_level, '\*$', '')), 6) as word_rank
    ) wr
    where kw.id_kanji = p_kanji_id
  ),
  best_per_group as (
    select distinct on (reading_number)
      kanji_word_id, reading_number, word, kana_reading, meanings,
      tier, level_gap, starred, freq_score
    from scored
    order by reading_number nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
  ),
  group_count as (
    select count(*) as n from best_per_group
  ),
  fill_ins as (
    select
      s.kanji_word_id, s.reading_number, s.word, s.kana_reading, s.meanings,
      s.tier, s.level_gap, s.starred, s.freq_score
    from scored s
    where not exists (select 1 from best_per_group b where b.kanji_word_id = s.kanji_word_id)
    order by s.tier asc, s.level_gap asc, s.starred asc, s.freq_score desc, s.kanji_word_id asc
    limit greatest(0, 3 - (select n from group_count))
  ),
  combined as (
    select * from best_per_group
    union all
    select * from fill_ins
  )
  select kanji_word_id, reading_number, word, kana_reading, meanings
  from combined
  order by tier asc, level_gap asc, starred asc, freq_score desc, reading_number nulls last, kanji_word_id asc
  limit 3;
$function$
;

-- 3. get_kanji_detail_words_batch ------------------------------------------

drop function if exists public.get_kanji_detail_words_batch(bigint[]);

create or replace function public.get_kanji_detail_words_batch(p_kanji_ids bigint[])
 returns table(
   kanji_id bigint,
   kanji_word_id bigint,
   word text,
   meanings text[],
   jlpt_level text,
   usually_kana boolean,
   furiganas text[]
 )
 language sql
 stable
as $function$
  with params as (
    select array['N5', 'N4', 'N3', 'N2', 'N1']::text[] as v_order
  ),
  kanji_rank as (
    select k.id as kanji_id,
           coalesce(array_position(p.v_order, regexp_replace(k.level, '\*$', '')), 6) as rank
    from public.kanji k
    cross join params p
    where k.id = any(p_kanji_ids)
  ),
  scored as (
    select
      kw.id_kanji as kanji_id,
      kw.id as kanji_word_id,
      kw.reading_number,
      v.word,
      v.meanings,
      v.jlpt_level,
      v.is_common_jisho,
      v.frequency,
      v.furiganas,
      v.usually_kana,
      case v.frequency
        when 'high' then 4
        when 'normal' then 3
        when 'low' then 2
        when 'lowest' then 1
        else 0
      end as freq_score,
      case
        when wr.word_rank <= kr.rank
        then
          case when v.is_common_jisho = true then 1 else 2 end
        else 3
      end as tier,
      greatest(wr.word_rank - kr.rank, 0) as level_gap,
      case when v.jlpt_level like '%*' then 1 else 0 end as starred
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word
    cross join params p
    join kanji_rank kr on kr.kanji_id = kw.id_kanji
    cross join lateral (
      select coalesce(array_position(p.v_order, regexp_replace(v.jlpt_level, '\*$', '')), 6) as word_rank
    ) wr
    where kw.id_kanji = any(p_kanji_ids)
  ),
  best_per_group as (
    select distinct on (kanji_id, reading_number)
      kanji_id, kanji_word_id, reading_number, word, meanings, jlpt_level, usually_kana, furiganas,
      tier, level_gap, starred, freq_score
    from scored
    order by kanji_id, reading_number nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
  ),
  group_count as (
    select kanji_id, count(*) as n from best_per_group group by kanji_id
  ),
  ranked_fill_ins as (
    select
      s.*,
      row_number() over (
        partition by s.kanji_id
        order by s.tier asc, s.level_gap asc, s.starred asc, s.freq_score desc, s.kanji_word_id asc
      ) as rn
    from scored s
    where not exists (
      select 1 from best_per_group b
      where b.kanji_word_id = s.kanji_word_id and b.kanji_id = s.kanji_id
    )
  ),
  fill_ins as (
    select
      r.kanji_id, r.kanji_word_id, r.reading_number, r.word, r.meanings, r.jlpt_level, r.usually_kana, r.furiganas,
      r.tier, r.level_gap, r.starred, r.freq_score
    from ranked_fill_ins r
    left join group_count g on g.kanji_id = r.kanji_id
    where r.rn <= greatest(0, 3 - coalesce(g.n, 0))
  ),
  combined as (
    select * from best_per_group
    union all
    select * from fill_ins
  ),
  final_ranked as (
    select
      *,
      row_number() over (
        partition by kanji_id
        order by tier asc, level_gap asc, starred asc, freq_score desc, reading_number nulls last, kanji_word_id asc
      ) as final_rn
    from combined
  )
  select kanji_id, kanji_word_id, word, meanings, jlpt_level, usually_kana, furiganas
  from final_ranked
  where final_rn <= 3
  order by kanji_id, tier asc, level_gap asc, starred asc, freq_score desc, reading_number nulls last, kanji_word_id asc;
$function$
;

-- 4. get_new_vocab_candidates -----------------------------------------------

drop function if exists public.get_new_vocab_candidates(uuid, text[], integer);

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
as $$
  select v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
  order by v.id asc
  limit p_limit;
$$;
