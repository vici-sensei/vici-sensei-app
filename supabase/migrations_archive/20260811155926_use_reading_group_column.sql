-- Run this manually in the Supabase SQL editor.
--
-- Switches get_kanji_detail_words / get_kanji_detail_words_batch (see
-- 20260811_prioritize_reading_number.sql) from public.kanji_word.reading_number
-- to public.kanji_word.reading_group. Same grouping/ordering logic, different
-- source column -- reading_group is the column the app should read from going
-- forward.
--
-- get_kanji_detail_words also renames its reading_number output column to
-- reading_group, so this uses CREATE OR REPLACE with an explicit DROP first
-- (return column list changed).

-- 1. get_kanji_detail_words -------------------------------------------------

drop function if exists public.get_kanji_detail_words(bigint);

create function public.get_kanji_detail_words(p_kanji_id bigint)
 returns table(
   kanji_word_id bigint,
   reading_group integer,
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
      kw.reading_group,
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
    select distinct on (reading_group)
      kanji_word_id, reading_group, word, kana_reading, meanings,
      tier, level_gap, starred, freq_score
    from scored
    order by reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
  ),
  group_count as (
    select count(*) as n from best_per_group
  ),
  fill_ins as (
    select
      s.kanji_word_id, s.reading_group, s.word, s.kana_reading, s.meanings,
      s.tier, s.level_gap, s.starred, s.freq_score
    from scored s
    where not exists (select 1 from best_per_group b where b.kanji_word_id = s.kanji_word_id)
    order by s.reading_group nulls last, s.tier asc, s.level_gap asc, s.starred asc, s.freq_score desc, s.kanji_word_id asc
    limit greatest(0, 3 - (select n from group_count))
  ),
  combined as (
    select * from best_per_group
    union all
    select * from fill_ins
  )
  select kanji_word_id, reading_group, word, kana_reading, meanings
  from combined
  order by reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
  limit 3;
$function$
;

-- 2. get_kanji_detail_words_batch -------------------------------------------
-- Return column list is unchanged (reading_group was never part of the
-- output here, only used internally for grouping), so plain CREATE OR REPLACE works.

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
      kw.reading_group,
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
    select distinct on (kanji_id, reading_group)
      kanji_id, kanji_word_id, reading_group, word, meanings, jlpt_level, usually_kana, furiganas,
      tier, level_gap, starred, freq_score
    from scored
    order by kanji_id, reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
  ),
  group_count as (
    select kanji_id, count(*) as n from best_per_group group by kanji_id
  ),
  ranked_fill_ins as (
    select
      s.*,
      row_number() over (
        partition by s.kanji_id
        order by s.reading_group nulls last, s.tier asc, s.level_gap asc, s.starred asc, s.freq_score desc, s.kanji_word_id asc
      ) as rn
    from scored s
    where not exists (
      select 1 from best_per_group b
      where b.kanji_word_id = s.kanji_word_id and b.kanji_id = s.kanji_id
    )
  ),
  fill_ins as (
    select
      r.kanji_id, r.kanji_word_id, r.reading_group, r.word, r.meanings, r.jlpt_level, r.usually_kana, r.furiganas,
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
        order by reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
      ) as final_rn
    from combined
  )
  select kanji_id, kanji_word_id, word, meanings, jlpt_level, usually_kana, furiganas
  from final_ranked
  where final_rn <= 3
  order by kanji_id, reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc;
$function$
;
