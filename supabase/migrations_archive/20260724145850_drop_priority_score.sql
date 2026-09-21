-- Drops vocabulary.priority_score and kanji_word.priority_score.
-- Both columns were only ever consumed inside get_new_kanji_candidates,
-- get_new_vocab_candidates, and search_vocabulary (never read directly from
-- app code) -- those three are redefined here first, dropping the
-- priority_score ordering/column in favor of plain id asc, then the columns
-- themselves are dropped.

create or replace function public.get_new_kanji_candidates(
  p_user_id uuid,
  p_enabled_levels text[],
  p_limit integer
)
returns table (
  id bigint,
  kanji text,
  meanings text[],
  level text,
  kun_readings text[],
  on_readings text[]
)
language sql
stable
as $$
  select k.id, k.kanji, k.meanings, k.level, k.kun_readings, k.on_readings
  from public.kanji k
  where k.level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_kanji_meaning_progress p
      where p.user_id = p_user_id and p.kanji_id = k.id
    )
  order by k.id asc
  limit p_limit;
$$;

drop function if exists public.get_new_vocab_candidates(uuid, text[], integer);

create or replace function public.get_new_vocab_candidates(
  p_user_id uuid,
  p_enabled_levels text[],
  p_limit integer
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
  other_readings text[]
)
language sql
stable
as $$
  select v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.ids_kanji, v.jlpt_level,
         v.is_common_jisho, v.usually_kana, v.frequency, v.romaji_reading, v.furiganas,
         v.romaji_furiganas, v.other_readings
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
  order by v.id asc
  limit p_limit;
$$;

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

alter table public.vocabulary drop column priority_score;
alter table public.kanji_word drop column priority_score;
