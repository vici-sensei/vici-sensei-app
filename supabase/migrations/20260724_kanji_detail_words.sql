-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Replaces the "3 words per kanji" selection used by GET /api/kanji/{id}.
-- Previously this was a plain supabase-js query ordered by reading_number
-- then priority_score. New rules:
--   1. prefer words whose JLPT level is the same as the kanji's level or
--      easier (N5 easiest .. N1 hardest; starred levels like 'N5*' count
--      as their unstarred level for this comparison)
--   2. prefer words with is_common_jisho = true
--   3. within a preference tier, rank by frequency desc
--      (high > normal > low > lowest > null)
--   4. group candidates by reading_number, picking the best-ranked word
--      per group (one reading example per group)
--   5. cap the final result at 3 words; priority_score no longer used
--
-- Each reading_number group is filled via a 3-tier fallback so that kanji
-- whose words don't all satisfy the strict filters still surface a word per
-- reading where possible:
--   tier 1 (best):  level matches AND is_common_jisho = true
--   tier 2:         level matches, is_common_jisho relaxed
--   tier 3 (worst): level relaxed too (is_common_jisho already relaxed)
-- Within tier 3, words whose level is closer to the kanji's level are
-- preferred over words further away (e.g. for an N3 kanji, an N2 word beats
-- an N1 word), before frequency is used as a tie-break.
-- If more than 3 groups produce a candidate, the 3 with the best
-- (tier, level_gap, frequency) win; groups that can't fill any tier are
-- dropped.
--
-- If grouping by reading_number leaves fewer than 3 rows (e.g. a kanji with
-- only 1-2 distinct readings), the reading_number grouping is relaxed: the
-- next-best remaining candidates (by tier, frequency) are added regardless
-- of reading_number, until 3 words are reached or candidates run out. So a
-- kanji with too few kanji_word rows overall can still return fewer than 3.
--
-- A NULL level (on either kanji or vocabulary) means "harder than N1" --
-- these rows exist but haven't been assigned a JLPT level. Ranked as 6
-- (one past N1's rank of 5) so they compare correctly: a NULL-level kanji
-- accepts words of any real level, while a NULL-level word only matches a
-- NULL-level kanji.
--
-- Starred levels (e.g. 'N5*') are treated as the same rank as their base
-- level for tier/level_gap purposes (a starred word is not pushed into a
-- worse tier), but a starred word is slightly harder in practice, so it
-- loses a tie-break against an otherwise-equal unstarred word at the same
-- nominal level. This only matters when two candidates are already equal
-- on tier, level_gap, and each other -- it does not change which tier a
-- word falls into.
--
-- Written as a Postgres function (see 20260718_query_functions.sql) rather
-- than embedded-relationship filtering in supabase-js, which this project
-- avoids for `!inner` + dot-notation filters.

create or replace function public.get_kanji_detail_words(p_kanji_id bigint)
 returns table(
   kanji_word_id bigint,
   reading_number integer,
   word_id bigint,
   word text,
   kana_reading text,
   meanings text[],
   level text,
   furiganas text[]
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
      v.jlpt_level as level,
      v.furiganas,
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
      kanji_word_id, reading_number, word_id, word, kana_reading, meanings, level, furiganas,
      tier, level_gap, starred, freq_score
    from scored
    order by reading_number nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
  ),
  group_count as (
    select count(*) as n from best_per_group
  ),
  fill_ins as (
    select
      s.kanji_word_id, s.reading_number, s.word_id, s.word, s.kana_reading, s.meanings, s.level, s.furiganas,
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
  select kanji_word_id, reading_number, word_id, word, kana_reading, meanings, level, furiganas
  from combined
  order by tier asc, level_gap asc, starred asc, freq_score desc, reading_number nulls last, kanji_word_id asc
  limit 3;
$function$
;
