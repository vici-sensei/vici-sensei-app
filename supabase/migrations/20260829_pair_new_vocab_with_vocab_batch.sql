-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Same idea as 20260828_pair_new_kanji_with_intro_bundle.sql, but for vocabulary: today's whole
-- batch of "New vocabulary" cards (ordered by id, same as today) should be followed, instantly,
-- by every one of today's "Vocabulary" cards for those same words, shuffled -- not one Vocabulary
-- card per New vocabulary card, and not after the normal 1-minute learning-step delay.
--
-- Unlike kanji (one RPC call creates the whole bundle for a single kanji) or hiragana/katakana
-- (a pack is a fixed, small gojuon_row grouping the DB already knows about), a vocab "pack" is
-- just "however many new words the user's daily quota lets them introduce today" -- there's no
-- natural grouping column for it. So the batch is scoped by calendar day (the same
-- v_local_date/v_day_start/v_day_end window introduce_vocabulary already uses for its cap
-- check), which also means it stays correct across multiple separate sessions on the same day,
-- not just a single sitting.
--
-- Two changes:
--
-- 1. introduce_vocabulary now inserts with due_at = now() + interval '10 minutes' instead of
--    the normal 1-minute first learning step -- that's what keeps an early word in today's
--    batch from surfacing as a normal due review while the user is still working through the
--    rest of today's New vocabulary cards. 1 minute turned out to be too tight: a user reading
--    each word/example at a normal pace can easily take longer than a minute to get through a
--    handful of New vocabulary cards, and the moment even one earlier word's due_at naturally
--    elapses, its Vocabulary card leaks out through the normal due-review path (reviews always
--    sort ahead of new material) -- ahead of the New vocabulary cards still left to introduce,
--    breaking the "all New vocabulary first, then instantly all Vocabulary" ordering entirely.
--    10 minutes comfortably covers realistic pacing through a small daily batch while still
--    self-healing (same as any other learning-step delay) if the batch is abandoned outright.
--    The insert that reaches today's cap (v_count + 1 >= v_cap) also flips due_at = now() for
--    every one of today's still-'learning' user_vocabulary_progress rows in the same
--    transaction -- so the moment the user finishes today's whole batch, all of it is
--    immediately due at once, without waiting out that 10-minute buffer. (A word can only ever
--    still be 'learning' on the same calendar day it was introduced without having been
--    reviewed yet -- relearning only happens after a real review lapses from 'review', which
--    can't happen before a first review -- so this scope can't accidentally sweep in an older,
--    still-struggling word from a previous day.)
--
-- 2. New get_vocab_intro_cards RPC: reads back exactly that same set (today's still-'learning'
--    vocab_meaning rows) in the shape get_due_cards' vocab_meaning branch already produces, so
--    the client can build DueCard rows for them directly, shuffle them, and prepend the whole
--    block to the queue as one atomic unit once it notices no New vocabulary cards are left to
--    introduce -- same client-side pattern as introduceKanaCard's finishPack.

create or replace function public.introduce_vocabulary(p_user_id uuid, p_word_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
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
  values (p_user_id, p_word_id, p_session_id, 'learning', now() + interval '10 minutes');

  if v_count + 1 >= v_cap then
    update public.user_vocabulary_progress
    set due_at = now()
    where user_id = p_user_id
      and status = 'learning'
      and created_at >= v_day_start
      and created_at < v_day_end;
  end if;
end;
$function$;

create or replace function public.get_vocab_intro_cards(p_user_id uuid, p_timezone text default 'UTC')
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
    'vocab_meaning'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, p.word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    v.word, v.kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
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
  where p.user_id = p_user_id
    and p.status = 'learning'
    and p.created_at >= ((now() at time zone p_timezone)::date::text)::timestamp at time zone p_timezone
    and p.created_at < (((now() at time zone p_timezone)::date::text)::timestamp at time zone p_timezone) + interval '1 day'
  order by p.id;
$function$;

grant execute on function public.get_vocab_intro_cards(uuid, text) to authenticated;
