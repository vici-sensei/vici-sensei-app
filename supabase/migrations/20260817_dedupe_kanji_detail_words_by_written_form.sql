-- public.vocabulary.word is not unique (see 20260814_accept_all_rows_for_duplicate_words.sql):
-- the same written form can appear on multiple vocabulary rows with different
-- readings/senses (e.g. two homographs), each landing in a different
-- kanji_word.reading_group. rebuild_kanji_detail_words() picked its champion
-- independently per reading_group, so a kanji's 3 "example words" could end
-- up showing the same written word twice (different pronunciation, same
-- text) -- confusing on /browse/kanji/detail and the new-kanji intro flow.
--
-- Fix: collapse `scored` down to the single best-scoring candidate per
-- (kanji_id, word) *before* grouping by reading_group, so no two rows picked
-- for the same kanji can ever share a written form. Everything downstream
-- (group_sizes, big_group_champions, best_per_group, fill-ins) now reads from
-- `deduped` instead of `scored`.

CREATE OR REPLACE FUNCTION public.rebuild_kanji_detail_words()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
      case v.frequency
        when 'high' then 4
        when 'normal' then 3
        when 'low' then 2
        when 'lowest' then 1
        else 0
      end as freq_score,
      case
        when wr.word_rank <= kr.lvl_rank
        then
          case when v.is_common_jisho = true then 1 else 2 end
        else 3
      end as tier,
      greatest(wr.word_rank - kr.lvl_rank, 0) as level_gap
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word
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
  big_group_champions as (
    select distinct on (s.kanji_id, s.reading_group)
      s.kanji_id, s.kanji_word_id, s.reading_group, s.tier, s.level_gap, s.freq_score
    from deduped s
    join group_sizes gs
      on gs.kanji_id = s.kanji_id
     and gs.reading_group is not distinct from s.reading_group
    where gs.group_size >= 3
    order by s.kanji_id, s.reading_group nulls last, s.tier asc, s.level_gap asc, s.freq_score desc, s.kanji_word_id asc
  ),
  big_group_count as (
    select kanji_id, count(*) as n from big_group_champions group by kanji_id
  ),
  best_per_group as (
    select distinct on (kanji_id, reading_group)
      kanji_id, kanji_word_id, reading_group, tier, level_gap, freq_score
    from deduped
    order by kanji_id, reading_group nulls last, tier asc, level_gap asc, freq_score desc, kanji_word_id asc
  ),
  group_count as (
    select kanji_id, count(*) as n from best_per_group group by kanji_id
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
      select 1 from best_per_group b
      where b.kanji_word_id = s.kanji_word_id and b.kanji_id = s.kanji_id
    )
  ),
  fill_ins as (
    select
      r.kanji_id, r.kanji_word_id, r.reading_group, r.tier, r.level_gap, r.freq_score
    from ranked_fill_ins r
    left join group_count g on g.kanji_id = r.kanji_id
    where r.rn <= greatest(0, 3 - coalesce(g.n, 0))
  ),
  fallback_combined as (
    select * from best_per_group
    union all
    select * from fill_ins
  ),
  fallback_ranked as (
    select
      *,
      row_number() over (
        partition by kanji_id
        order by reading_group nulls last, tier asc, level_gap asc, freq_score desc, kanji_word_id asc
      ) as final_rn
    from fallback_combined
  ),
  fallback_top3 as (
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, freq_score
    from fallback_ranked
    where final_rn <= 3
  ),
  final_rows as (
    select bgc.kanji_id, bgc.kanji_word_id, bgc.reading_group, bgc.tier, bgc.level_gap, bgc.freq_score
    from big_group_champions bgc
    join big_group_count bgcnt on bgcnt.kanji_id = bgc.kanji_id
    where bgcnt.n >= 3

    union all

    select f.kanji_id, f.kanji_word_id, f.reading_group, f.tier, f.level_gap, f.freq_score
    from fallback_top3 f
    where coalesce((select bgcnt2.n from big_group_count bgcnt2 where bgcnt2.kanji_id = f.kanji_id), 0) < 3
  )
  select
    kanji_id,
    kanji_word_id,
    row_number() over (
      partition by kanji_id
      order by reading_group nulls last, tier asc, level_gap asc, freq_score desc, kanji_word_id asc
    ) as rank
  from final_rows;
end;
$function$
;

SELECT public.rebuild_kanji_detail_words();
