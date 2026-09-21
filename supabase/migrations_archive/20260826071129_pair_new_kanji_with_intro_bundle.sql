-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Mirrors 20260826_pair_new_kana_with_reading_pack.sql, but for kanji: when a user finishes
-- a "New kanji" card, the matching "Kanji meaning" card and every "Word reading" card for the
-- words shown on it should appear immediately after -- ahead of any other reviews already
-- queued -- not wait out the normal learning-step delay and get shuffled in with everything
-- else later. Unlike hiragana/katakana, there's no multi-tap "pack" here: introduce_kanji
-- already creates the kanji_meaning_progress row AND every kanji_reading_progress row (one per
-- kanji_detail_words entry) in one shot, so the whole bundle is ready the instant that single
-- RPC call returns.
--
-- Two changes:
--
-- 1. introduce_kanji used to set due_at = now() + interval '1 minute' (the normal first
--    learning-step delay) on both inserts. Changed to due_at = now() so the freshly-introduced
--    rows are immediately due -- the client (useStudyQueue.ts) fetches them right after
--    introduce_kanji resolves instead of waiting on the delay/next poll.
--
-- 2. New get_kanji_intro_cards RPC: given the kanji_id the client just finished introducing,
--    returns its kanji_meaning row (if any) followed by every kanji_reading row, in the same
--    shape get_due_cards' kanji_meaning/kanji_reading branches already produce -- ordered
--    meaning-first then by kanji_detail_words.rank -- so the client can build DueCard rows for
--    them directly (same toDueCard() mapping as get_due_cards), shuffle just the reading cards
--    client-side, and prepend the whole block [meaning, ...shuffled readings] to the queue as
--    one atomic unit, without a second generic due-cards fetch.
--
-- This only governs the moment of introduction. Once a kanji_meaning/kanji_reading row
-- graduates out of status='learning' it goes back to being an independent SRS review on its
-- own schedule like any other card -- the bundle is a one-time hand-off, not a permanent
-- pairing.

create or replace function public.introduce_kanji(p_user_id uuid, p_kanji_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
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
  values (p_user_id, p_kanji_id, p_session_id, 'learning', now());

  insert into public.user_kanji_reading_progress (user_id, kanji_id, kanji_word_id, status, due_at)
  select p_user_id, p_kanji_id, kw.kanji_word_id, 'learning', now()
  from public.get_kanji_detail_words(p_kanji_id) kw;
end;
$function$;

create or replace function public.get_kanji_intro_cards(p_user_id uuid, p_kanji_id bigint)
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
      0 as ord,
      0 as sub_ord,
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
    where p.user_id = p_user_id
      and p.kanji_id = p_kanji_id
      and p.status != 'suspended'

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      1 as ord,
      coalesce(kdw.rank, 0) as sub_ord,
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
    left join public.kanji_detail_words kdw on kdw.kanji_word_id = kw.id and kdw.kanji_id = p.kanji_id
    where p.user_id = p_user_id
      and p.kanji_id = p_kanji_id
      and p.status != 'suspended'
  ) cards
  order by ord, sub_ord;
$function$;

grant execute on function public.get_kanji_intro_cards(uuid, bigint) to authenticated;
