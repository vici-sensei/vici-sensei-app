-- Precompute kanji_word selection instead of recomputing the scoring CTEs
-- (window functions, group-size threshold, tier/level-gap ranking) on every
-- get_kanji_detail_words / get_kanji_detail_words_batch call. kanji,
-- vocabulary and kanji_word never change at runtime, so the winning set of
-- kanji_word_id per kanji is stable and only needs to be built once.
--
-- The selection algorithm itself now lives in rebuild_kanji_detail_words(),
-- which is the single source of truth. To change the algorithm in the
-- future: CREATE OR REPLACE rebuild_kanji_detail_words() with the new logic
-- in a new migration, then call `select public.rebuild_kanji_detail_words();`
-- at the end of that same migration to repopulate the table. The two
-- get_kanji_detail_words* functions never need to change — they only read
-- from the table.

CREATE TABLE public.kanji_detail_words (
	kanji_id int8 NOT NULL,
	kanji_word_id int8 NOT NULL,
	rank int4 NOT NULL,
	CONSTRAINT kanji_detail_words_pkey PRIMARY KEY (kanji_id, kanji_word_id),
	CONSTRAINT fk_kanji_detail_words_kanji FOREIGN KEY (kanji_id) REFERENCES public.kanji(id) ON DELETE CASCADE,
	CONSTRAINT fk_kanji_detail_words_kanji_word FOREIGN KEY (kanji_word_id) REFERENCES public.kanji_word(id) ON DELETE CASCADE
);
CREATE INDEX idx_kanji_detail_words_kanji_rank ON public.kanji_detail_words USING btree (kanji_id, rank);
ALTER TABLE public.kanji_detail_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read kanji_detail_words" ON public.kanji_detail_words
 AS PERMISSIVE
 FOR SELECT
 TO authenticated
 USING (true);


-- DROP FUNCTION public.rebuild_kanji_detail_words();

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
           coalesce(array_position(p.v_order, regexp_replace(k.level, '\*$', '')), 6) as lvl_rank
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
      greatest(wr.word_rank - kr.lvl_rank, 0) as level_gap,
      case when v.jlpt_level like '%*' then 1 else 0 end as starred
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word
    cross join params p
    join kanji_rank kr on kr.kanji_id = kw.id_kanji
    cross join lateral (
      select coalesce(array_position(p.v_order, regexp_replace(v.jlpt_level, '\*$', '')), 6) as word_rank
    ) wr
  ),
  group_sizes as (
    select kanji_id, reading_group, count(*) as group_size
    from scored
    group by kanji_id, reading_group
  ),
  big_group_champions as (
    select distinct on (s.kanji_id, s.reading_group)
      s.kanji_id, s.kanji_word_id, s.reading_group, s.tier, s.level_gap, s.starred, s.freq_score
    from scored s
    join group_sizes gs
      on gs.kanji_id = s.kanji_id
     and gs.reading_group is not distinct from s.reading_group
    where gs.group_size >= 3
    order by s.kanji_id, s.reading_group nulls last, s.tier asc, s.level_gap asc, s.starred asc, s.freq_score desc, s.kanji_word_id asc
  ),
  big_group_count as (
    select kanji_id, count(*) as n from big_group_champions group by kanji_id
  ),
  best_per_group as (
    select distinct on (kanji_id, reading_group)
      kanji_id, kanji_word_id, reading_group, tier, level_gap, starred, freq_score
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
      r.kanji_id, r.kanji_word_id, r.reading_group, r.tier, r.level_gap, r.starred, r.freq_score
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
        order by reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
      ) as final_rn
    from fallback_combined
  ),
  fallback_top3 as (
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, starred, freq_score
    from fallback_ranked
    where final_rn <= 3
  ),
  final_rows as (
    select bgc.kanji_id, bgc.kanji_word_id, bgc.reading_group, bgc.tier, bgc.level_gap, bgc.starred, bgc.freq_score
    from big_group_champions bgc
    join big_group_count bgcnt on bgcnt.kanji_id = bgc.kanji_id
    where bgcnt.n >= 3

    union all

    select f.kanji_id, f.kanji_word_id, f.reading_group, f.tier, f.level_gap, f.starred, f.freq_score
    from fallback_top3 f
    where coalesce((select bgcnt2.n from big_group_count bgcnt2 where bgcnt2.kanji_id = f.kanji_id), 0) < 3
  )
  select
    kanji_id,
    kanji_word_id,
    row_number() over (
      partition by kanji_id
      order by reading_group nulls last, tier asc, level_gap asc, starred asc, freq_score desc, kanji_word_id asc
    ) as rank
  from final_rows;
end;
$function$
;


-- get_kanji_detail_words / get_kanji_detail_words_batch: same signatures and
-- return shapes as before, now just a lookup against the precomputed table
-- instead of recomputing the scoring logic on every call.

CREATE OR REPLACE FUNCTION public.get_kanji_detail_words(p_kanji_id bigint)
 RETURNS TABLE(kanji_word_id bigint, reading_group integer, word text, kana_reading text, meanings text[])
 LANGUAGE sql
 STABLE
AS $function$
  select kw.id, kw.reading_group, v.word, v.kana_reading, v.meanings
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
  order by kdw.rank;
$function$
;

CREATE OR REPLACE FUNCTION public.get_kanji_detail_words_batch(p_kanji_ids bigint[])
 RETURNS TABLE(kanji_id bigint, kanji_word_id bigint, word text, meanings text[], jlpt_level text, usually_kana boolean, furiganas text[])
 LANGUAGE sql
 STABLE
AS $function$
  select kdw.kanji_id, kw.id, v.word, v.meanings, v.jlpt_level, v.usually_kana, v.furiganas
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = any(p_kanji_ids)
  order by kdw.kanji_id, kdw.rank;
$function$
;


-- Initial population.
SELECT public.rebuild_kanji_detail_words();
