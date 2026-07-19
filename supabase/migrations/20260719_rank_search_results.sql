-- Run this manually in DBeaver or the Supabase SQL editor (after 20260718_query_functions.sql).
--
-- search_kanji/search_vocabulary previously matched on any of several
-- columns but always ordered by id asc, so an exact hit on the kanji
-- character/word itself ranked no higher than an incidental substring match
-- buried in an English meaning. This adds a match_rank tier (0 = best) so
-- identity fields (kanji char / word / readings) outrank meaning substrings,
-- and exact/prefix matches outrank arbitrary substrings. No extension
-- (pg_trgm) needed at this data size -- worth revisiting only if the table
-- grows enough for ILIKE '%...%' full scans to become slow.
--
-- Signatures (params + returned columns) are unchanged, so existing grants
-- from 20260718_query_functions.sql still apply.

create or replace function public.search_kanji(
  p_query text,
  p_level text,
  p_limit integer,
  p_offset integer
)
returns table (
  id bigint,
  kanji text,
  meanings text[],
  level text,
  kun_readings text[],
  on_readings text[],
  total_count bigint
)
language sql
stable
as $$
  with scored as (
    select
      k.*,
      case
        when p_query is null or p_query = '' then 0
        when k.kanji = p_query then 0
        when exists (
          select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
          where r ilike p_query
        ) then 1
        when k.kanji ilike p_query || '%'
          or exists (
            select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
            where r ilike p_query || '%'
          ) then 2
        when k.kanji ilike '%' || p_query || '%'
          or exists (
            select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
            where r ilike '%' || p_query || '%'
          ) then 3
        when exists (
          select 1 from unnest(coalesce(k.meanings, '{}')) m where m ilike p_query || '%'
        ) then 4
        when exists (
          select 1 from unnest(coalesce(k.meanings, '{}')) m where m ilike '%' || p_query || '%'
        ) then 5
        else null
      end as match_rank
    from public.kanji k
    where p_level is null or k.level = p_level
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, id asc
    limit p_limit offset p_offset
  )
  select id, kanji, meanings, level, kun_readings, on_readings, total_count
  from matches;
$$;

create or replace function public.search_vocabulary(
  p_query text,
  p_level text,
  p_limit integer,
  p_offset integer
)
returns table (
  id bigint,
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
  other_readings text[],
  priority_score integer,
  total_count bigint
)
language sql
stable
as $$
  with scored as (
    select
      v.*,
      case
        when p_query is null or p_query = '' then 0
        when v.word ilike p_query then 0
        when v.kana_reading ilike p_query or v.romaji_reading ilike p_query then 1
        when v.word ilike p_query || '%'
          or v.kana_reading ilike p_query || '%'
          or v.romaji_reading ilike p_query || '%'
          then 2
        when v.word ilike '%' || p_query || '%'
          or v.kana_reading ilike '%' || p_query || '%'
          or v.romaji_reading ilike '%' || p_query || '%'
          then 3
        when exists (
          select 1 from unnest(coalesce(v.meanings, '{}')) m where m ilike p_query || '%'
        ) then 4
        when exists (
          select 1 from unnest(coalesce(v.meanings, '{}')) m where m ilike '%' || p_query || '%'
        ) then 5
        else null
      end as match_rank
    from public.vocabulary v
    where p_level is null or v.jlpt_level = p_level
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, priority_score desc nulls last, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, frequency, romaji_reading, furiganas, romaji_furiganas, other_readings,
         priority_score, total_count
  from matches;
$$;
