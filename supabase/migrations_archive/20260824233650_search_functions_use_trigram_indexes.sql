-- search_vocabulary()/search_kanji() compute match_rank via one big CASE expression, then
-- filter on "match_rank is not null". Postgres can't push any individual ILIKE inside that CASE
-- down to an index -- it has to evaluate the whole CASE per row, so both functions sequential-
-- scanned their table even after 20260825_search_trigram_indexes.sql added the trigram indexes
-- (confirmed with EXPLAIN ANALYZE: ~280ms Seq Scan on vocabulary's 17k rows, ~55ms on kanji's 2k).
--
-- Fix: add a WHERE clause with the same conditions as literal ILIKE predicates (not hidden
-- inside the CASE), so the planner can use the trigram indexes. Each added disjunct is a
-- superset of its corresponding CASE branch (substring implies prefix implies exact for the same
-- column), so this can only narrow the scan before the CASE re-derives the exact tier for
-- ordering -- it never excludes a row the CASE would have ranked. Verified by comparing full
-- result sets (ids, in order) before/after for several queries: identical.
--
-- meanings/kun_readings/on_readings are text[] columns -- pg_trgm's gin_trgm_ops only indexes
-- text, so a plain index on the array can't accelerate unnest()+ILIKE the way it does for
-- word/kana_reading/romaji_reading. Worked around with a functional trigram index on the array
-- joined into one string (immutable_array_to_string wraps the built-in array_to_string, which is
-- STABLE not IMMUTABLE, so it can't be used in an index expression directly). Concatenating loses
-- element boundaries, so this join is only ever used as a widening pre-filter in the WHERE clause
-- (a false positive here just gets re-rejected by the CASE's real per-element check below) --
-- never to replace the per-element unnest()+ILIKE that computes the actual match_rank tier.
--
-- Result, measured with EXPLAIN ANALYZE: search_vocabulary('day', ...) 279ms -> 13ms;
-- search_kanji('water', ...) 54ms -> 5ms.

create or replace function public.immutable_array_to_string(text[]) returns text
 language sql
 immutable
 parallel safe
as $function$ select array_to_string($1, ' ') $function$;

create index concurrently if not exists idx_vocabulary_meanings_trgm
  on public.vocabulary using gin (public.immutable_array_to_string(coalesce(meanings, '{}'::text[])) gin_trgm_ops);

create index concurrently if not exists idx_kanji_readings_trgm
  on public.kanji using gin (public.immutable_array_to_string(coalesce(kun_readings, '{}'::text[]) || coalesce(on_readings, '{}'::text[])) gin_trgm_ops);

create index concurrently if not exists idx_kanji_meanings_trgm
  on public.kanji using gin (public.immutable_array_to_string(coalesce(meanings, '{}'::text[])) gin_trgm_ops);

create or replace function public.search_vocabulary(p_query text, p_level text[], p_limit integer, p_offset integer)
 returns table(id bigint, word text, kana_reading text, meanings text[], parts_of_speech text[], ids_kanji bigint[], jlpt_level text, is_common_jisho boolean, usually_kana boolean, frequency text, romaji_reading text, furiganas text[], romaji_furiganas text[], other_readings text[], total_count bigint)
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
    where (p_level is null or v.jlpt_level = any(p_level))
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
    order by match_rank asc, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, frequency, romaji_reading, furiganas, romaji_furiganas, other_readings,
         total_count
  from matches;
$function$;

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
    where (p_level is null or k.level = any(p_level))
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
