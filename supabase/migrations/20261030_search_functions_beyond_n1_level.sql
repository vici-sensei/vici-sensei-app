-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- /browse/vocabulary and /browse/kanji gained a ">N1" filter button alongside N5..N1, for
-- rows with no JLPT classification (kanji.level / vocabulary.jlpt_level IS NULL -- both
-- columns already allow NULL per their check constraints, so no schema change is needed).
--
-- search_kanji/search_vocabulary filtered strictly with `level = any(p_level)`, which never
-- matches on a NULL column (NULL = anything is NULL, not true) -- so there was previously no
-- way to select those rows through the RPC. p_level now recognizes '>N1' as a sentinel: when
-- present, rows with a NULL level/jlpt_level are included alongside whatever real levels are
-- also selected.

drop function if exists public.search_kanji(text, text[], int4, int4);

create or replace function public.search_kanji(p_query text, p_level text[], p_limit integer, p_offset integer)
 returns table(id bigint, kanji text, meanings text[], level text, kun_readings text[], on_readings text[], total_count bigint)
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
    where (
      p_level is null
      or k.level = any(p_level)
      or (k.level is null and '>N1' = any(p_level))
    )
      -- Same technique as search_vocabulary: literal ILIKE predicates mirroring "match_rank is
      -- not null", so the planner can use the trigram indexes instead of scanning every row to
      -- evaluate the CASE. Each disjunct is a superset of its CASE branch, so this never drops a
      -- row the CASE would have ranked -- the CASE still re-derives the exact tier for ordering.
      and (
        params.q is null
        or k.kanji ilike '%' || params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(k.kun_readings, '{}') || coalesce(k.on_readings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
        or public.immutable_array_to_string(coalesce(k.meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
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
$function$;

grant execute on function public.search_kanji(text, text[], integer, integer) to authenticated, anon;

drop function if exists public.search_vocabulary(text, text[], int4, int4);

create or replace function public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer)
 returns table(id bigint, word text, kana_reading text, meanings text[], parts_of_speech text[], ids_kanji bigint[], jlpt_level text, is_common_jisho boolean, usually_kana boolean, romaji_reading text, furiganas text[], romaji_furiganas text[], other_readings text[], total_count bigint)
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
            select 1 from unnest(coalesce(v.meanings, '{}')) m where lower(m) = lower(params.q)
          )
          then 1
        when v.word ilike params.q_escaped || '%' escape '\'
          or v.kana_reading ilike params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(v.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
          )
          then 2
        when v.word ilike '%' || params.q_escaped || '%' escape '\'
          or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
          then 3
        when exists (
          select 1 from unnest(coalesce(v.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 4
        else null
      end as match_rank
    from public.vocabulary v
    cross join params
    where (
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
        or public.immutable_array_to_string(coalesce(v.meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, frequency_number desc, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, romaji_reading, furiganas, romaji_furiganas, other_readings,
         total_count
  from matches;
$function$;

grant execute on function public.search_vocabulary(text, text[], integer, integer) to authenticated, anon;
