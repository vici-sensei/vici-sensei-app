-- Run this manually in DBeaver or the Supabase SQL editor (after 20260719_rank_search_results.sql).
--
-- search_kanji/search_vocabulary interpolated p_query straight into ILIKE
-- patterns. That's safe from SQL injection (p_query is a bound parameter,
-- never concatenated into the query text), but ILIKE still parses "%" and
-- "_" as pattern wildcards regardless of how the value got there. A search
-- for a literal "_" turned into the pattern '%_%', which matches any
-- string of length >= 1 -- i.e. almost every row, silently ignoring the
-- user's actual query. Same issue for "%".
--
-- Fix: escape backslash/%/_ in p_query once (via a CTE, since this is a
-- plain SQL function and can't use a plpgsql DECLARE), and use that escaped
-- value for the prefix/substring tiers. The "exact match" tiers no longer
-- use ILIKE at all (which would have the same wildcard problem even
-- without an explicit "%"/"_ " appended) -- they use a plain case-insensitive
-- "=" instead, which never interprets pattern characters.
--
-- Signatures (params + returned columns) are unchanged, so existing grants
-- still apply.

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
      k.*,
      case
        when params.q is null then 0
        when lower(k.kanji) = lower(params.q) then 0
        when exists (
          select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
          where lower(r) = lower(params.q)
        ) then 1
        when k.kanji ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
            where r ilike params.q_escaped || '%' escape '\'
          ) then 2
        when k.kanji ilike '%' || params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) r
            where r ilike '%' || params.q_escaped || '%' escape '\'
          ) then 3
        when exists (
          select 1 from unnest(coalesce(k.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
        ) then 4
        when exists (
          select 1 from unnest(coalesce(k.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 5
        else null
      end as match_rank
    from public.kanji k
    cross join params
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
        when lower(v.kana_reading) = lower(params.q) or lower(v.romaji_reading) = lower(params.q) then 1
        when v.word ilike params.q_escaped || '%' escape '\'
          or v.kana_reading ilike params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike params.q_escaped || '%' escape '\'
          then 2
        when v.word ilike '%' || params.q_escaped || '%' escape '\'
          or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike '%' || params.q_escaped || '%' escape '\'
          then 3
        when exists (
          select 1 from unnest(coalesce(v.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
        ) then 4
        when exists (
          select 1 from unnest(coalesce(v.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 5
        else null
      end as match_rank
    from public.vocabulary v
    cross join params
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
