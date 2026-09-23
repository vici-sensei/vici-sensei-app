-- EU-new + US-new BOTH, identical text (kanji/kanji_word/vocabulary reference data and
-- rebuild_kanji_detail_words() are identical on both; the frozen project doesn't get it).
--
-- Keeps words whose furigana is shared between the kanji being studied and a neighbouring kanji
-- (jukujikun/ateji: 今日 きょう = ["きょう","-"], 大人 おとな, 田舎 いなか, 倫敦 ロンドン) out of
-- the per-kanji example-word / Word reading selection. Their reading belongs to the whole word, not
-- to the kanji: renderTargetWord (lib/study/furigana.tsx) hides the furigana of the whole segment
-- containing the target, and the card asks for the whole word's reading -- so such a card tests
-- knowing the word by heart, not the kanji's reading. They got in mostly by accident: every
-- jukujikun is its own reading_group, and a group with >=2 words earns its own champion, so 日 got
-- 今日 only because 今日この頃 also exists (昨日/明日/一日 ついたち, alone in their groups, didn't).
--
-- "Shared" is decided on the FIRST occurrence of the kanji in the word -- the one renderTargetWord
-- targets -- with buildFuriganaSegments' own rules: furiganas has one entry per character (else
-- there's no segmentation info and the word counts as not shared), and the kanji either is covered
-- by the reading before it (its entry is '-') or its own reading covers the next character (next
-- entry is '-').
--
-- Candidates now fall into 3 classes, and each kanji only uses its best non-empty class:
--   0 = normal word, 1 = shared-furigana word, 2 = usually_kana word (any furigana).
-- For class 2 this is exactly the old usually_kana fallback (20260919005334). Class 1 is the new
-- fallback, so a kanji whose only words are ateji (倫敦, 硝子, 茄子...) keeps them. The ">=2 words"
-- group rule only applies to class 0 kanji now (before: to any kanji with a non-uk candidate); a
-- fallback kanji only gets its 3 largest groups. Tiering, champions, fill-ins and ordering are
-- otherwise unchanged from the baseline.
--
-- Measured on both live projects before writing this (read-only simulation, identical results; the
-- same simulation with the new class disabled reproduced the current table exactly):
-- kanji_detail_words 5202 -> 5191 rows, 104 words out, 93 replacements in. 11 kanji end up with one
-- word fewer (日 7->6, 人 5->4, ...), the 265 kanji with no word at all are unchanged, and 14 N1
-- kanji stay on ateji-only lists (the fallback). Existing reading cards on words that leave: only
-- the test account 6aa23b27 (人/大人, 日/今日). They are left in place -- get_due_cards doesn't
-- check kanji_detail_words, so an already-introduced card keeps being reviewed; new introductions
-- (introduce_kanji reads get_kanji_detail_words) never create one again.

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
           k.kanji as kanji_char,
           coalesce(array_position(p.v_order, k.level), 6) as lvl_rank
    from public.kanji k
    cross join params p
  ),
  scored_all as (
    select
      kw.id_kanji as kanji_id,
      kw.id as kanji_word_id,
      kw.reading_group,
      v.word,
      coalesce(v.frequency_number, 0) as freq_score,
      v.is_common_jisho as is_common,
      case when wr.word_rank <= kr.lvl_rank then 1 else 2 end as tier,
      greatest(wr.word_rank - kr.lvl_rank, 0) as level_gap,
      case when v.usually_kana is true then 2 when sf.is_shared then 1 else 0 end as cand_class
    from public.kanji_word kw
    join public.vocabulary v on v.id = kw.id_word and v.study_enabled
    cross join params p
    join kanji_rank kr on kr.kanji_id = kw.id_kanji
    cross join lateral (
      select coalesce(array_position(p.v_order, v.jlpt_level), 6) as word_rank
    ) wr
    cross join lateral (
      select regexp_split_to_array(v.word, '') as chars
    ) c
    cross join lateral (
      select array_position(c.chars, kr.kanji_char) as pos
    ) tp
    cross join lateral (
      -- The kanji's furigana is shared with a neighbour: covered by the reading before it, or its
      -- own reading covers the next character (see the header).
      select coalesce(
        array_length(v.furiganas, 1) = array_length(c.chars, 1)
        and tp.pos is not null
        and (v.furiganas[tp.pos] = '-'
             or (v.furiganas[tp.pos] <> '' and v.furiganas[tp.pos + 1] = '-')),
        false) as is_shared
    ) sf
  ),
  kanji_class as (
    select kanji_id, min(cand_class) as min_class
    from scored_all
    group by kanji_id
  ),
  scored as (
    -- Only the kanji's best available class: normal words, else its shared-furigana words, else
    -- its usually_kana words -- so every kanji with any candidate still gets example words.
    select s.kanji_id, s.kanji_word_id, s.reading_group, s.word, s.freq_score, s.is_common, s.tier, s.level_gap
    from scored_all s
    join kanji_class kc on kc.kanji_id = s.kanji_id
    where s.cand_class = kc.min_class
  ),
  deduped as (
    select distinct on (kanji_id, word)
      kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score
    from scored
    order by kanji_id, word, tier asc, level_gap asc, is_common desc, freq_score desc, kanji_word_id asc
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
    -- among the kanji's 3 largest groups, or when it has >=2 words outright (only for a kanji
    -- with normal candidates, not one falling back to shared-furigana or usually_kana words)
    -- (so kanji with more than 3 genuinely big groups still keep all of them).
    select gr.kanji_id, gr.reading_group
    from group_rank gr
    join kanji_class kc on kc.kanji_id = gr.kanji_id
    where gr.size_rank <= 3
       or (gr.group_size >= 2 and kc.min_class = 0)
  ),
  group_champions as (
    select distinct on (s.kanji_id, s.reading_group)
      s.kanji_id, s.kanji_word_id, s.reading_group, s.tier, s.level_gap, s.is_common, s.freq_score
    from deduped s
    join selected_groups sg
      on sg.kanji_id = s.kanji_id
     and sg.reading_group is not distinct from s.reading_group
    order by s.kanji_id, s.reading_group nulls last, s.tier asc, s.level_gap asc, s.is_common desc, s.freq_score desc, s.kanji_word_id asc
  ),
  champion_count as (
    select kanji_id, count(*) as n from group_champions group by kanji_id
  ),
  ranked_fill_ins as (
    select
      s.*,
      row_number() over (
        partition by s.kanji_id
        order by s.reading_group nulls last, s.tier asc, s.level_gap asc, s.is_common desc, s.freq_score desc, s.kanji_word_id asc
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
      r.kanji_id, r.kanji_word_id, r.reading_group, r.tier, r.level_gap, r.is_common, r.freq_score
    from ranked_fill_ins r
    join champion_count cc on cc.kanji_id = r.kanji_id
    where cc.n < 3
      and r.rn <= (3 - cc.n)
  ),
  combined as (
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score from group_champions
    union all
    select kanji_id, kanji_word_id, reading_group, tier, level_gap, is_common, freq_score from fill_ins
  )
  select
    kanji_id,
    kanji_word_id,
    row_number() over (
      partition by kanji_id
      order by reading_group nulls last, tier asc, level_gap asc, is_common desc, freq_score desc, kanji_word_id asc
    ) as rank
  from combined;
end;
$function$;

select public.rebuild_kanji_detail_words();
