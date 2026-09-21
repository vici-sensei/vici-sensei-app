-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- None of introduce_kanji/introduce_vocabulary/introduce_hiragana/introduce_katakana or
-- get_new_kanji_candidates/get_new_vocab_candidates/get_new_hiragana_candidates/
-- get_new_katakana_candidates ever checked study_track or the per-category study_kanji/
-- study_vocabulary/study_hiragana/study_katakana flags -- they only ever checked the daily cap
-- and "not already introduced"/"not already progressed". None of these functions are SECURITY
-- DEFINER (20260819_lock_pending_deletion_accounts.sql), so this was never a cross-user hole --
-- RLS's `auth.uid() = user_id` already stops anyone from touching another account's rows
-- regardless of what p_user_id a call passes. But it did mean a user could call
-- introduce_katakana directly (bypassing the normal /study queue entirely, e.g. from the
-- browser console) and introduce katakana characters for their own account before ever
-- finishing hiragana -- the enforce_katakana_requires_hiragana_trigger and
-- hiragana_regression_disables_katakana_trigger added earlier today only guard the
-- user_study_settings.study_katakana column itself, not the ability to create progress rows
-- directly. Symmetric gap on the standard track for study_kanji/study_vocabulary.
--
-- Fix: every one of these eight functions now also requires study_track and the matching
-- per-category flag to be on for that user, read straight from user_study_settings (same
-- get-it-from-the-DB-not-the-client idiom get_due_cards already uses for study_track alone).
-- The introduce_* functions raise with errcode P0002 -- the same code already used for "already
-- introduced"/"daily cap reached" -- so the client's existing handling (lib/data/introduce.ts
-- maps P0002 to a 409, which useStudyQueue.ts's introduceCard already treats as "nothing to
-- introduce here, drop silently") covers this case for free, with no client change needed. In
-- normal use none of these should ever actually fire -- the get_new_*_candidates functions
-- return nothing to introduce once the flag is off, so the UI never offers the action -- these
-- are a backstop against direct RPC calls and settings changing mid-session, not a path real
-- users hit.
--
-- get_due_cards gets the equivalent fix a different way: it already re-derives study_track
-- server-side instead of trusting the client-sent p_include_kanji/p_include_vocab/
-- p_include_hiragana/p_include_katakana flags for THAT, but still trusted those same four
-- booleans for the per-category gate. Redefined below to read study_kanji/study_vocabulary/
-- study_hiragana/study_katakana from the DB too, via one settings CTE shared by all five
-- branches instead of five repeated scalar subqueries. The p_include_* parameters stay in the
-- signature (callers still pass them) but are no longer consulted -- this needed no changes on
-- the client side, since it already sends the correct values, just no longer needs to be
-- trusted to.

create or replace function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text)
language sql
stable
as $function$
  select h.id, h."character", h.romaji, h.gojuon_row
  from public.hiragana h
  where not exists (
    select 1 from public.user_hiragana_progress p
    where p.user_id = p_user_id and p.hiragana_id = h.id
  )
  and exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  )
  order by h.sort_order asc
  limit p_limit;
$function$;

create or replace function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text)
language sql
stable
as $function$
  select k.id, k."character", k.romaji, k.gojuon_row
  from public.katakana k
  where not exists (
    select 1 from public.user_katakana_progress p
    where p.user_id = p_user_id and p.katakana_id = k.id
  )
  and exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  )
  order by k.sort_order asc
  limit p_limit;
$function$;

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
as $function$
  select k.id, k.kanji, k.meanings, k.level, k.kun_readings, k.on_readings
  from public.kanji k
  where k.level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_kanji_meaning_progress p
      where p.user_id = p_user_id and p.kanji_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
    )
  order by k.id asc
  limit p_limit;
$function$;

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
  jlpt_level text,
  usually_kana boolean,
  furiganas text[]
)
language sql
stable
as $function$
  select v.id, v.word, v.kana_reading, v.meanings, v.parts_of_speech, v.jlpt_level,
         v.usually_kana, v.furiganas
  from public.vocabulary v
  where v.jlpt_level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_vocabulary_progress p
      where p.user_id = p_user_id and p.word_id = v.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
    )
  order by v.id asc
  limit p_limit;
$function$;

create or replace function public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

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

  if v_count >= v_cap then
    raise exception 'Daily new hiragana limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id
  ) then
    raise exception 'This hiragana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

create or replace function public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

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

  if v_count >= v_cap then
    raise exception 'Daily new katakana limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id
  ) then
    raise exception 'This katakana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

create or replace function public.introduce_kanji(
  p_user_id uuid,
  p_kanji_id bigint,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_kanji:' || p_user_id::text));

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
  ) then
    raise exception 'Kanji study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_kanji_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_kanji_meaning_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    raise exception 'Daily new kanji limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_kanji_meaning_progress
    where user_id = p_user_id and kanji_id = p_kanji_id
  ) then
    raise exception 'This kanji has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_kanji_meaning_progress (user_id, kanji_id, session_id, status, due_at)
  values (p_user_id, p_kanji_id, p_session_id, 'learning', now() + interval '1 minute');

  insert into public.user_kanji_reading_progress (user_id, kanji_id, kanji_word_id, status, due_at)
  select p_user_id, p_kanji_id, kw.kanji_word_id, 'learning', now() + interval '1 minute'
  from public.get_kanji_detail_words(p_kanji_id) kw;
end;
$function$;

create or replace function public.introduce_vocabulary(
  p_user_id uuid,
  p_word_id bigint,
  p_timezone text default 'UTC',
  p_session_id bigint default null
)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_vocabulary:' || p_user_id::text));

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'standard' and s.study_vocabulary
  ) then
    raise exception 'Vocabulary study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_vocab_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_vocabulary_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    raise exception 'Daily new word limit reached' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_vocabulary_progress
    where user_id = p_user_id and word_id = p_word_id
  ) then
    raise exception 'This word has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_vocabulary_progress (user_id, word_id, session_id, status, due_at)
  values (p_user_id, p_word_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_kanji_candidates(uuid, text[], integer) to authenticated;
grant execute on function public.get_new_vocab_candidates(uuid, text[], integer) to authenticated;
grant execute on function public.introduce_hiragana(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_katakana(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_kanji(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_vocabulary(uuid, bigint, text, bigint) to authenticated;

create or replace function public.get_due_cards(
  p_user_id uuid,
  p_enabled_levels text[],
  p_include_kanji boolean,
  p_include_vocab boolean,
  p_include_hiragana boolean,
  p_include_katakana boolean,
  p_limit integer
)
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  with settings as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana
    from public.user_study_settings
    where user_id = p_user_id
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      null::bigint as hiragana_id,
      null::bigint as katakana_id,
      p.due_at,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      p.due_at,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      (
        select array_agg(distinct r)
        from (
          select v2.kana_reading as r from public.vocabulary v2 where v2.word = v.word and v2.kana_reading is not null
          union
          select v2.romaji_reading from public.vocabulary v2 where v2.word = v.word and v2.romaji_reading is not null
          union
          select unnest(v2.other_readings) from public.vocabulary v2 where v2.word = v.word
        ) readings
      ) as all_word_readings,
      (
        select array_agg(distinct k2.kanji)
        from public.kanji_word kw2
        join public.kanji k2 on k2.id = kw2.id_kanji
        where kw2.id_word = v.id
          and kw2.id_kanji != p.kanji_id
          and exists (
            select 1
            from public.kanji_word kw3
            join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
            where kw3.id_kanji = kw2.id_kanji
              and kw3.reading_group = kw2.reading_group
              and p3.user_id = p_user_id
              and p3.status = 'review'
              and p3.repetitions >= 2
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      null::bigint, null::bigint,
      p.due_at,
      null::text, null::text[],
      v.word, v.kana_reading,
      null::text, null::text[],
      v.furiganas,
      v.meanings as word_meanings,
      (
        select array_agg(distinct m)
        from (
          select unnest(v2.meanings) as m
          from public.vocabulary v2
          where v2.word = v.word
            and v2.kana_reading is not distinct from v.kana_reading
        ) meanings
      ) as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_vocabulary
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and v.jlpt_level = any(p_enabled_levels)

    union all

    select
      'hiragana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      p.hiragana_id, null::bigint,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_hiragana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'

    union all

    select
      'katakana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      null::bigint, p.katakana_id,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_katakana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
  ) due
  order by due_at asc
  limit p_limit;
$function$;

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer) to authenticated;
