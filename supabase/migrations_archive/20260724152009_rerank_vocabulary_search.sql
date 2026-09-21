-- Reworks search_vocabulary match ranking:
--   * meanings now gets an exact-match tier, tied with kana_reading/
--     romaji_reading exact match. Without it, a query like "day" ranked the
--     word meaning exactly "day" (日) the same as any word whose meaning
--     merely starts with "day" (e.g. "daybeforeyesterday"), so the obviously
--     correct match only won on id tie-break instead of relevance.
--   * meanings-prefix now ties with word/kana_reading/romaji_reading-prefix
--     (neither Japanese-side nor English-side prefix matches are assumed
--     more likely to reflect user intent, since the search box doesn't know
--     which language the query is in).
--   * romaji_reading is dropped from substring matching entirely -- it's a
--     Latin-alphabet transliteration of kana_reading, so any genuine
--     phonetic-containment match is already found via kana_reading substring,
--     while romaji-only substring hits are typically coincidental collisions
--     with English query letters (e.g. "day" substring-matching "daiyaru").
--   * word/kana_reading substring still outranks meanings substring, since
--     kanji/kana containment reflects real compound-word relationships.

drop function if exists public.search_vocabulary(text, text[], int4, int4);

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
    where p_level is null or v.jlpt_level = any(p_level)
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
$function$
;

grant execute on function public.search_vocabulary(text, text[], integer, integer) to authenticated, anon;
