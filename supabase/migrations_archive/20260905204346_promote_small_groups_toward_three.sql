-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- rebuild_kanji_detail_words() (see 20260817_dedupe_kanji_detail_words_by_written_form.sql)
-- only treated a reading_group as "big" -- eligible to contribute its own
-- champion word -- when it had >=3 candidate words. If a kanji had fewer than
-- 3 such big groups, the whole big-group mechanism was abandoned and the
-- fallback kicked in: one champion per *any* reading_group (big or small),
-- ordered by reading_group, then filled with leftover individual words up to
-- 3 total. That fallback under-used reading diversity: e.g. a kanji with one
-- big group (5 words) and four 1-word groups would ignore reading spread
-- entirely and could end up with all 3 example words coming from the same
-- reading if that reading's champion also won the individual-candidate
-- fill-in ranking.
--
-- New rule: when there are fewer than 3 big (size>=3) groups, promote the
-- next-largest small groups -- one at a time, largest first -- until either
-- 3 groups are selected or there are no more distinct reading_groups for
-- that kanji. Concretely: a group is selected if it's one of the kanji's 3
-- largest groups (size_rank <= 3) OR it has >=3 words outright (so a kanji
-- with 4+ genuinely big groups still keeps ALL of them, unbounded, exactly
-- as before -- that part was intentionally left unchanged).
--
-- Only after group selection is settled do individual-word fill-ins kick in,
-- and only if the kanji doesn't even have 3 distinct reading_groups to begin
-- with (fewer than 3 groups selected) -- filling from the same groups'
-- leftover candidates, same as the pre-existing fallback did.
--
-- Ties in group size are broken by reading_group ascending (lower
-- reading_group = more common reading), consistent with every other
-- reading_group tie-break in this function.

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
$function$
;

SELECT public.rebuild_kanji_detail_words();
