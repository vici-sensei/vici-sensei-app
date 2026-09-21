-- Run this manually in DBeaver or the Supabase SQL editor (after 20260717_study_sessions.sql).
--
-- Moves the risky/uncertain parts of the study-queue and search logic out of
-- supabase-js query-builder calls (embedded-relationship filtering via
-- `!inner` + dot-notation, and client-built `IN (1,2,3,...)` lists that don't
-- scale and could hit URL length limits) into plain Postgres functions,
-- called via `.rpc()` (POST with a JSON body, no URL-length concern, no
-- PostgREST-specific filter syntax to get wrong).
--
-- All functions are SECURITY INVOKER (the default) so RLS on the progress
-- tables still applies normally through the `authenticated` role.

-- 1. Due cards across all three progress tables, already sorted + limited.
create or replace function public.get_due_cards(
  p_user_id uuid,
  p_enabled_levels text[],
  p_include_kanji boolean,
  p_include_vocab boolean,
  p_limit integer,
  p_as_of timestamptz default now()
)
returns table (
  exercise_type text,
  progress_id bigint,
  kanji_id bigint,
  word_id bigint,
  kanji_word_id bigint,
  status text,
  due_at timestamptz,
  ease_factor numeric,
  interval_days integer,
  repetitions integer,
  lapses integer,
  learning_step integer,
  kanji_char text,
  kanji_meanings text[],
  word text,
  kana_reading text
)
language sql
stable
as $$
  select * from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      p.status, p.due_at, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p_include_kanji
      and p.user_id = p_user_id
      and p.due_at <= p_as_of
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      p.status, p.due_at, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      k.kanji, k.meanings,
      v.word, v.kana_reading
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    where p_include_kanji
      and p.user_id = p_user_id
      and p.due_at <= p_as_of
      and p.status != 'suspended'
      and kw.level = any(p_enabled_levels)

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      p.status, p.due_at, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step,
      null::text, null::text[],
      v.word, v.kana_reading
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p_include_vocab
      and p.user_id = p_user_id
      and p.due_at <= p_as_of
      and p.status != 'suspended'
      and v.jlpt_level = any(p_enabled_levels)
  ) due
  order by due_at asc
  limit p_limit;
$$;

-- 2. New kanji candidates (no existing progress row), ordered by the max
-- priority_score of their associated kanji_word rows -- restores the
-- priority-based ordering from the original spec (kanji itself has no
-- priority_score column, only kanji_word/vocabulary do).
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
  order by (
    select max(kw.priority_score) from public.kanji_word kw where kw.id_kanji = k.id
  ) desc nulls last, k.id asc
  limit p_limit;
$$;

-- 3. New vocabulary candidates (no existing progress row), ordered by
-- vocabulary.priority_score directly.
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
  other_readings text[],
  priority_score integer
)
language sql
stable
as $$
  select v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.ids_kanji, v.jlpt_level,
         v.is_common_jisho, v.usually_kana, v.frequency, v.romaji_reading, v.furiganas,
         v.romaji_furiganas, v.other_readings, v.priority_score
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
  order by v.priority_score desc nulls last, v.id asc
  limit p_limit;
$$;

-- 4. Consecutive-day review streak, unbounded (the previous app-side
-- implementation only looked at the same 30-day window used for retention
-- rate, so any streak longer than 30 days was silently truncated).
create or replace function public.get_review_streak(p_user_id uuid)
returns integer
language plpgsql
stable
as $$
declare
  v_streak integer := 0;
  v_cursor date := current_date;
begin
  loop
    exit when not exists (
      select 1 from public.review_logs
      where user_id = p_user_id
        and undone = false
        and reviewed_at::date = v_cursor
    );
    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  end loop;
  return v_streak;
end;
$$;

-- 5. Kanji search with real substring matching on meanings/readings (a plain
-- `.or()`/`.cs.{}` filter from supabase-js can only do exact-element array
-- matches, not substring, since PostgREST can't unnest+ILIKE a text[] column).
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
  with matches as (
    select k.*, count(*) over() as total_count
    from public.kanji k
    where (p_level is null or k.level = p_level)
      and (
        p_query is null or p_query = ''
        or k.kanji ilike '%' || p_query || '%'
        or exists (select 1 from unnest(k.meanings) m where m ilike '%' || p_query || '%')
        or exists (select 1 from unnest(k.kun_readings) m where m ilike '%' || p_query || '%')
        or exists (select 1 from unnest(k.on_readings) m where m ilike '%' || p_query || '%')
      )
    order by k.id asc
    limit p_limit offset p_offset
  )
  select id, kanji, meanings, level, kun_readings, on_readings, total_count from matches;
$$;

-- 6. Vocabulary search, same substring-matching rationale as search_kanji.
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
  with matches as (
    select v.*, count(*) over() as total_count
    from public.vocabulary v
    where (p_level is null or v.jlpt_level = p_level)
      and (
        p_query is null or p_query = ''
        or v.word ilike '%' || p_query || '%'
        or v.kana_reading ilike '%' || p_query || '%'
        or v.romaji_reading ilike '%' || p_query || '%'
        or exists (select 1 from unnest(v.meanings) m where m ilike '%' || p_query || '%')
      )
    order by v.id asc
    limit p_limit offset p_offset
  )
  select id, word, kana_reading, meanings, parts_of_speech, ids_kanji, jlpt_level, is_common_jisho,
         usually_kana, frequency, romaji_reading, furiganas, romaji_furiganas, other_readings,
         priority_score, total_count
  from matches;
$$;

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, integer, timestamptz) to authenticated;
grant execute on function public.get_new_kanji_candidates(uuid, text[], integer) to authenticated;
grant execute on function public.get_new_vocab_candidates(uuid, text[], integer) to authenticated;
grant execute on function public.get_review_streak(uuid) to authenticated;
grant execute on function public.search_kanji(text, text, integer, integer) to authenticated, anon;
grant execute on function public.search_vocabulary(text, text, integer, integer) to authenticated, anon;
