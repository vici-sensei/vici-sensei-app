-- Run this manually in the Supabase SQL editor.
--
-- GET /api/study/queue calls get_kanji_detail_words (20260724_kanji_detail_words.sql)
-- once per new-kanji candidate inside Promise.all — N round trips instead of
-- one. This batches the exact same selection rules across multiple kanji ids
-- in a single query, using window functions partitioned by kanji_id instead
-- of the single-kanji kanji_rank CTE. See 20260724_kanji_detail_words.sql for
-- the full rationale behind the tiering/ranking rules reproduced here.

create or replace function public.get_kanji_detail_words_batch(p_kanji_ids bigint[])
 returns table(
   kanji_id bigint,
   kanji_word_id bigint,
   reading_number integer,
   word_id bigint,
   word text,
   kana_reading text,
   meanings text[],
   parts_of_speech text[],
   ids_kanji bigint[],
   jlpt_level text,
   is_common_jisho boolean,
   usually_kana boolean,
   frequency text,
   romaji_reading text,
   furiganas text[],
   romaji_furiganas text[],
   other_readings text[]
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
      v.id as word_id,
      v.word,
      v.kana_reading,
      v.meanings,
      v.parts_of_speech,
      v.ids_kanji,
      v.jlpt_level,
      v.is_common_jisho,
      v.usually_kana,
      v.frequency,
      v.romaji_reading,
      v.furiganas,
      v.romaji_furiganas,
      v.other_readings,
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
      kanji_id, kanji_word_id, reading_number, word_id, word, kana_reading, meanings, parts_of_speech,
      ids_kanji, jlpt_level, is_common_jisho, usually_kana, frequency, romaji_reading,
      furiganas, romaji_furiganas, other_readings,
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
      r.kanji_id, r.kanji_word_id, r.reading_number, r.word_id, r.word, r.kana_reading, r.meanings, r.parts_of_speech,
      r.ids_kanji, r.jlpt_level, r.is_common_jisho, r.usually_kana, r.frequency, r.romaji_reading,
      r.furiganas, r.romaji_furiganas, r.other_readings,
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
  select kanji_id, kanji_word_id, reading_number, word_id, word, kana_reading, meanings, parts_of_speech,
         ids_kanji, jlpt_level, is_common_jisho, usually_kana, frequency, romaji_reading,
         furiganas, romaji_furiganas, other_readings
  from final_ranked
  where final_rn <= 3
  order by kanji_id, tier asc, level_gap asc, starred asc, freq_score desc, reading_number nulls last, kanji_word_id asc;
$function$
;
