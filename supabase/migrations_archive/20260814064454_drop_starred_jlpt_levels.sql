-- Neither public.kanji.level nor public.vocabulary.jlpt_level carry
-- starred values (e.g. 'N5*') anymore -- the data source stopped producing
-- them. Tighten both CHECK constraints to the 5 real JLPT levels only, and
-- drop the now-dead "starred" tie-break and regexp_replace('\*$', '')
-- normalization from rebuild_kanji_detail_words() (see comments in
-- 20260724_kanji_detail_words.sql for the tie-break's original purpose).
--
-- Run this manually in DBeaver or the Supabase SQL editor.

ALTER TABLE public.kanji DROP CONSTRAINT kanji_level_check;
ALTER TABLE public.kanji ADD CONSTRAINT kanji_level_check CHECK (
  level IS NULL OR level = ANY (ARRAY['N5'::text, 'N4'::text, 'N3'::text, 'N2'::text, 'N1'::text])
);

ALTER TABLE public.vocabulary DROP CONSTRAINT vocabulary_jlpt_level_check;
ALTER TABLE public.vocabulary ADD CONSTRAINT vocabulary_jlpt_level_check CHECK (
  jlpt_level IS NULL OR jlpt_level = ANY (ARRAY['N5'::text, 'N4'::text, 'N3'::text, 'N2'::text, 'N1'::text])
);

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
  group_sizes as (
    select kanji_id, reading_group, count(*) as group_size
    from scored
    group by kanji_id, reading_group
  ),
  big_group_champions as (
    select distinct on (s.kanji_id, s.reading_group)
      s.kanji_id, s.kanji_word_id, s.reading_group, s.tier, s.level_gap, s.freq_score
    from scored s
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
    from scored
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
    from scored s
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
