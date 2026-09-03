-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Bug: introduce_hiragana_examples/introduce_katakana_examples (RETURNS TABLE(hiragana_id bigint)/
-- TABLE(katakana_id bigint)) failed every single time they had anything to introduce, with
-- "column reference \"hiragana_id\" is ambiguous ... could refer to either a PL/pgSQL variable or
-- a table column" -- even though the RETURNING clause already table-qualifies it
-- (`returning user_hiragana_progress.hiragana_id`). This is a known plpgsql quirk: the RETURNS
-- TABLE column becomes an implicit variable in scope for the whole function body, and plpgsql's
-- variable-substitution pass over RETURNING target lists can flag a match as ambiguous even when
-- schema-qualified, rather than preferring the column the way a plain SQL RETURNING would.
--
-- Symptom: fetchStudyQueue (lib/data/studyQueue.ts) calls introduceHiraganaExamples whenever it
-- sees any entry_kind = 'example' candidate in that fetch. Since an example row (e.g. んな for
-- n_gemination) only becomes a candidate once every character row ahead of it is already
-- introduced, this bug was latent for any account that hadn't yet reached that point -- it surfaces
-- the first time a user's progress reaches "only example/rule cards left", which is exactly what
-- surfaced it here. The RPC's 400 aborted the whole due-cards fetch, so /study got stuck loading.
--
-- Fix: add the `#variable_conflict use_column` compiler pragma (must appear before the function's
-- first DECLARE/BEGIN) so plpgsql resolves this kind of ambiguity in favor of the table column,
-- matching ordinary SQL semantics. Bodies are otherwise byte-for-byte unchanged from
-- 20260906_kana_examples_skip_intro_card.sql's later CREATE OR REPLACE (the one that added
-- p_timezone/dropped the id-list param and switched to RETURNING). Signatures are unchanged, so
-- existing grants and callers are unaffected.

create or replace function public.introduce_hiragana_examples(p_user_id uuid, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(hiragana_id bigint)
language plpgsql
as $function$
#variable_conflict use_column
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  ) then
    raise exception 'Hiragana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_hiragana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(v_cap - v_count, 0);

  return query
  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_hiragana_candidates(p_user_id, v_remaining) c
  where c.entry_kind = 'example'
  on conflict (user_id, hiragana_id) do nothing
  returning user_hiragana_progress.hiragana_id;
end;
$function$;

create or replace function public.introduce_katakana_examples(p_user_id uuid, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(katakana_id bigint)
language plpgsql
as $function$
#variable_conflict use_column
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  ) then
    raise exception 'Katakana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_katakana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_katakana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(v_cap - v_count, 0);

  return query
  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_katakana_candidates(p_user_id, v_remaining) c
  where c.entry_kind = 'example'
  on conflict (user_id, katakana_id) do nothing
  returning user_katakana_progress.katakana_id;
end;
$function$;
