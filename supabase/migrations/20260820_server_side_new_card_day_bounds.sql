-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- introduce_kanji()/introduce_vocabulary() (20260820_enforce_daily_new_card_cap.sql) took
-- p_day_start/p_day_end timestamptz computed by the CLIENT BROWSER and trusted them, unvalidated,
-- to count today's introductions against the daily cap. A client can send a fabricated window
-- (e.g. one with zero existing rows) and bypass the cap entirely -- confirmed live against this
-- project: with new_kanji_per_day=1 already reached, calling introduce_kanji with
-- p_day_start/p_day_end set to year 2020 inserted a second kanji for the same real day.
--
-- Fix: never accept a client-computed instant. Take only the user's IANA timezone (a
-- preference, not a clock) and compute "today" from Postgres's own now() -- same idiom
-- get_review_activity (20260808_review_activity_rpc.sql) already uses: local date via
-- `now() at time zone p_timezone`, converted back to a timestamptz day-start/end.

drop function if exists public.introduce_kanji(uuid, bigint, timestamptz, timestamptz, bigint);

create function public.introduce_kanji(
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

grant execute on function public.introduce_kanji(uuid, bigint, text, bigint) to authenticated;

drop function if exists public.introduce_vocabulary(uuid, bigint, timestamptz, timestamptz, bigint);

create function public.introduce_vocabulary(
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

grant execute on function public.introduce_vocabulary(uuid, bigint, text, bigint) to authenticated;
