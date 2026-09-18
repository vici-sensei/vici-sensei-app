-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Postgres defaults DESC ordering to NULLS FIRST, so `order by frequency_number desc` puts rows
-- with no frequency_number ahead of every row with a real (however small) frequency, not behind
-- them. This was latent since 2026-10-13/14 introduced these orderings, because frequency_number
-- was fully backfilled from frequency_number_estimated at the time (0 nulls). It surfaced today
-- after clearing frequency_number and repopulating it only from BCCWJ luw_frequency matches
-- (16352/17349 rows) -- the remaining 997 unmatched rows (e.g. id 169, 下さい) are NULL and were
-- floating to the top of both functions below, ahead of every word with a real frequency count.
--
-- rebuild_kanji_detail_words() is unaffected: it already does coalesce(v.frequency_number, 0),
-- so NULL is treated as the lowest possible score there, not the highest.

create or replace function public.get_new_vocab_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer)
returns table(id bigint, word text, kana_reading text, primary_meanings text[], parts_of_speech text[], jlpt_level text, usually_kana boolean, furiganas text[])
language sql
stable
as $function$
  select v.id, v.word, v.kana_reading, public.vocabulary_primary_meanings(v), v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and v.study_enabled
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
    )
  order by v.is_common_jisho desc, v.frequency_number desc nulls last, v.id asc
  limit p_limit;
$function$;

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
      dm.meanings as display_meanings,
      case
        when params.q is null then 0
        when lower(v.word) = lower(params.q) then 0
        when lower(v.kana_reading) = lower(params.q) or lower(v.romaji_reading) = lower(params.q)
          or exists (
            select 1 from unnest(coalesce(dm.meanings, '{}')) m where lower(m) = lower(params.q)
          )
          then 1
        when v.word ilike params.q_escaped || '%' escape '\'
          or v.kana_reading ilike params.q_escaped || '%' escape '\'
          or v.romaji_reading ilike params.q_escaped || '%' escape '\'
          or exists (
            select 1 from unnest(coalesce(dm.meanings, '{}')) m where m ilike params.q_escaped || '%' escape '\'
          )
          then 2
        when v.word ilike '%' || params.q_escaped || '%' escape '\'
          or v.kana_reading ilike '%' || params.q_escaped || '%' escape '\'
          then 3
        when exists (
          select 1 from unnest(coalesce(dm.meanings, '{}')) m where m ilike '%' || params.q_escaped || '%' escape '\'
        ) then 4
        else null
      end as match_rank
    from public.vocabulary v
    cross join params
    cross join lateral (select public.vocabulary_primary_meanings(v) as meanings) dm
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
        or public.immutable_array_to_string(coalesce(dm.meanings, '{}')) ilike '%' || params.q_escaped || '%' escape '\'
      )
  ),
  matches as (
    select *, count(*) over () as total_count
    from scored
    where match_rank is not null
    order by match_rank asc, is_common_jisho desc, frequency_number desc nulls last, id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, display_meanings as primary_meanings, other_meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, romaji_reading, furiganas, romaji_furiganas, other_readings,
         total_count
  from matches;
$function$;
