-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Exposes public.vocabulary.other_meanings on the two RPCs behind /browse/vocabulary and
-- /browse/kanji/detail's word list, so the browse UI can offer a "Show other meanings" toggle
-- under a word's primary meanings. lib/data/vocabulary.ts's fetchVocabularyDetail (behind
-- /browse/vocabulary/detail) needs no migration -- it's a plain column select, widened in the same
-- app commit as this migration.
--
-- Only these two functions change -- get_kanji_detail_words_batch (used by the study-flow's
-- NewKanjiIntroCard word previews, not any /browse page) is untouched, out of scope for this ask.
--
-- Both changed here add a column to an existing RETURNS TABLE, which -- like every other
-- return-shape change in this file's history -- needs `drop function` first (42P13: "cannot change
-- return type of existing function"), then a re-grant to the same roles each already had `execute`
-- for (anon, authenticated, service_role).

drop function if exists public.search_vocabulary(text, text[], integer, integer);
drop function if exists public.get_kanji_detail_words(bigint);

create or replace function public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer)
 returns table(id bigint, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, parts_of_speech text[], ids_kanji bigint[], jlpt_level text, is_common_jisho boolean, usually_kana boolean, romaji_reading text, furiganas text[], romaji_furiganas text[], other_readings text[], total_count bigint)
 language sql
 stable
as $function$
  with params as (
    select
      nullif(p_query, '') as q,
      case
        when nullif(p_query, '') is null then null
        else replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_')
      end as q_escaped
  ),
  scored as (
    select
      v.*,
      case
        when params.q is null then 0
        when lower(v.word) = lower(params.q) then 0
        when lower(v.kana_reading) = lower(params.q) or lower(v.romaji_reading) = lower(params.q)
          or exists (
            select 1 from unnest(coalesce(v.primary_meanings, '{}')) m where lower(m) = lower(params.q)
          )
          then 1
        when v.word ilike params.q_escaped || '%' escape '\'
          or v.kana_reading ilike params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(v.primary_meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
          )
          then 2
        when v.word ilike '%' || params.q_escaped || '%' escape '\'
          or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
          then 3
        when exists (
          select 1 from unnest(coalesce(v.primary_meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 4
        else null
      end as match_rank
    from public.vocabulary v
    cross join params
    where v.study_enabled
      and (
        p_level is null
        or v.jlpt_level = any(p_level)
        or (v.jlpt_level is null and '>N1' = any(p_level))
      )
      -- Mirrors "match_rank is not null" as literal ILIKE predicates (not hidden inside the
      -- CASE above) so the planner can push them down to the trigram indexes instead of
      -- sequential-scanning the whole table to evaluate the CASE per row. Each disjunct here is
      -- a superset of its corresponding CASE branch (substring implies prefix implies exact for
      -- the same column), so this never excludes a row the CASE would have ranked -- it only
      -- narrows the scan before the CASE re-derives the exact tier for ordering.
      and (
        params.q is null
        or v.word ilike '%' || params.q_escaped || '%' escape '\'
        or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
        or v.romaji_reading ilike params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(v.primary_meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, frequency_number desc, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, primary_meanings, other_meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, romaji_reading, furiganas, romaji_furiganas, other_readings,
         total_count
  from matches;
$function$;

create or replace function public.get_kanji_detail_words(p_kanji_id bigint)
returns table(kanji_word_id bigint, reading_group integer, word text, kana_reading text, primary_meanings text[], other_meanings jsonb, furiganas text[], jlpt_level text)
language sql
stable
as $function$
  select kw.id, kw.reading_group, v.word, v.kana_reading, v.primary_meanings, v.other_meanings, v.furiganas, v.jlpt_level
  from public.kanji_detail_words kdw
  join public.kanji_word kw on kw.id = kdw.kanji_word_id
  join public.vocabulary v on v.id = kw.id_word
  where kdw.kanji_id = p_kanji_id
    and v.study_enabled
  order by kdw.rank;
$function$;

grant execute on function public.search_vocabulary(text, text[], integer, integer) to anon, authenticated, service_role;
grant execute on function public.get_kanji_detail_words(bigint) to anon, authenticated, service_role;
