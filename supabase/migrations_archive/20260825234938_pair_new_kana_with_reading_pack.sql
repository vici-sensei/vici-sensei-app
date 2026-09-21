-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- When a user finishes introducing a whole "New Hiragana"/"New Katakana" gojuon pack
-- (20260826_complete_gojuon_packs_for_new_kana.sql), the matching "Hiragana reading"/
-- "Katakana reading" cards for that exact same pack should show up immediately after,
-- ahead of any other reviews already queued -- not wait out the normal learning-step
-- delay and get shuffled in with everything else later.
--
-- Two changes:
--
-- 1. introduce_hiragana/introduce_katakana used to set due_at = now() + interval '1
--    minute' (the normal first learning-step delay). Changed to due_at = now() so the
--    freshly-introduced row is immediately due -- the client (useStudyQueue.ts) fetches
--    it right after the pack completes instead of waiting on the delay/next poll.
--
-- 2. New get_hiragana_reading_cards/get_katakana_reading_cards RPCs: given the exact
--    list of hiragana_id/katakana_id the client just finished introducing (one pack),
--    return their fresh reading-card rows in the same shape get_due_cards' hiragana_
--    reading/katakana_reading branches already produce, ordered by the caller's array
--    order (the pack's gojuon order) via WITH ORDINALITY -- so the client can build
--    DueCard rows for them directly (same toDueCard() mapping as get_due_cards) without
--    a second generic due-cards fetch, and prepend them to the queue as one block.

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
    -- Over the cap already -- still allow this one if it's finishing a pack
    -- (another character from the same gojuon_row) that was already started
    -- today, rather than starting a fresh pack once the cap is spent.
    if not exists (
      select 1
      from public.user_hiragana_progress p
      join public.hiragana h on h.id = p.hiragana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and h.gojuon_row = (select gojuon_row from public.hiragana where id = p_hiragana_id)
    ) then
      raise exception 'Daily new hiragana limit reached' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id
  ) then
    raise exception 'This hiragana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now());
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
    -- Same pack-completion carve-out as introduce_hiragana above.
    if not exists (
      select 1
      from public.user_katakana_progress p
      join public.katakana k on k.id = p.katakana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and k.gojuon_row = (select gojuon_row from public.katakana where id = p_katakana_id)
    ) then
      raise exception 'Daily new katakana limit reached' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id
  ) then
    raise exception 'This katakana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now());
end;
$function$;

create or replace function public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[])
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
  select
    'hiragana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    p.hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    h.character as kana_character, h.romaji as kana_romaji,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_hiragana_ids) with ordinality as ids(hiragana_id, ord)
  join public.user_hiragana_progress p on p.user_id = p_user_id and p.hiragana_id = ids.hiragana_id
  join public.hiragana h on h.id = p.hiragana_id
  where p.status != 'suspended'
  order by ids.ord;
$function$;

create or replace function public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[])
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
  select
    'katakana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, p.katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    k.character as kana_character, k.romaji as kana_romaji,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_katakana_ids) with ordinality as ids(katakana_id, ord)
  join public.user_katakana_progress p on p.user_id = p_user_id and p.katakana_id = ids.katakana_id
  join public.katakana k on k.id = p.katakana_id
  where p.status != 'suspended'
  order by ids.ord;
$function$;

grant execute on function public.introduce_hiragana(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_katakana(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.get_hiragana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.get_katakana_reading_cards(uuid, bigint[]) to authenticated;
