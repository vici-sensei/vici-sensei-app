-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Bug: a gojuon_row pack (e.g. hiragana's a-row: あ,い,う,え,お) is only ever "complete" in the
-- client's own memory. introduce_hiragana/introduce_katakana set due_at = now() on EVERY
-- character the instant it's introduced, regardless of whether it's the first or the last tap
-- in its pack -- what kept an early character's hiragana_reading card from surfacing before its
-- siblings were introduced was purely useStudyQueue.ts's hiraganaActivePackRef/
-- hiraganaPackDoneRef (React refs) plus mergeKeepingCurrent's isInProgressPackItem guard.
--
-- Those refs live only as long as the component is mounted. If the user ends the study session
-- (or refreshes the page) after introducing only some of a pack's characters, the next /study
-- mount starts with empty refs: the app has no memory that あ was mid-pack. Its
-- hiragana_reading row is already due_at = now() in the DB, so it surfaces immediately as an
-- ordinary due review (reviewsFirst puts reviews ahead of new material) and gets drilled to
-- graduation alone -- then い,う,え,お get introduced afterward and drilled together, split from
-- あ entirely. See the bug report this migration fixes for the full repro.
--
-- Fix: move "is this pack complete" out of client memory and into the database, the same way
-- 20260830_vocab_batch_pending_flag.sql already does for the vocab batch (pending_batch). A new
-- pack_pending flag keeps a freshly-introduced character invisible to get_due_cards until every
-- other study_enabled entry_kind = 'character' row sharing its gojuon_row also has a progress
-- row for this user -- at which point introduce_hiragana/introduce_katakana bulk-flips
-- pack_pending = false and due_at = now() for the WHOLE pack in the same statement, so every
-- character becomes due at the exact same instant regardless of which session introduced which
-- character, or how much real time passed between them.
--
-- introduce_hiragana/introduce_katakana now return (pack_completed, hiragana_ids/katakana_ids)
-- instead of void, so the client can still do its snappy "fetch the reading pack and splice it
-- in immediately" hand-off -- but that's now a pure UX accelerant, not the source of truth: even
-- if the client never calls back (crash, refresh, another tab finishes the pack), the next
-- ordinary get_due_cards fetch surfaces the whole completed pack correctly on its own.

-- ---------------------------------------------------------------------------
-- 1. pack_pending column -- mirrors user_vocabulary_progress.pending_batch.
-- ---------------------------------------------------------------------------
alter table public.user_hiragana_progress add column if not exists pack_pending boolean not null default false;
alter table public.user_katakana_progress add column if not exists pack_pending boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. get_due_cards: never surface a still-pending pack member. Return shape unchanged from
--    20260906_selective_examples_and_seion_only_drill.sql (kana_type + drill_streak already
--    exposed), so CREATE OR REPLACE is enough.
-- ---------------------------------------------------------------------------
create or replace function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
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
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
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
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
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
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
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
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_vocabulary
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pending_batch
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
      h.character as kana_character, h.romaji as kana_romaji, h.kana_type,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_hiragana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pack_pending

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
      k.character as kana_character, k.romaji as kana_romaji, k.kana_type,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_katakana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pack_pending
  ) due
  order by due_at asc
  limit p_limit;
$function$;

-- ---------------------------------------------------------------------------
-- 3. get_hiragana_reading_cards/get_katakana_reading_cards: same guard, defense in depth --
--    these are only ever called by the client with ids the RPC below just confirmed complete,
--    but a still-pending row must never be servable under any circumstance. Return shape
--    unchanged from 20260906_selective_examples_and_seion_only_drill.sql.
-- ---------------------------------------------------------------------------
create or replace function public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer,
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
    h.character as kana_character, h.romaji as kana_romaji, h.kana_type, p.drill_streak,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_hiragana_ids) with ordinality as ids(hiragana_id, ord)
  join public.user_hiragana_progress p on p.user_id = p_user_id and p.hiragana_id = ids.hiragana_id
  join public.hiragana h on h.id = p.hiragana_id
  where p.status != 'suspended'
    and not p.pack_pending
  order by ids.ord;
$function$;

create or replace function public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer,
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
    k.character as kana_character, k.romaji as kana_romaji, k.kana_type, p.drill_streak,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_katakana_ids) with ordinality as ids(katakana_id, ord)
  join public.user_katakana_progress p on p.user_id = p_user_id and p.katakana_id = ids.katakana_id
  join public.katakana k on k.id = p.katakana_id
  where p.status != 'suspended'
    and not p.pack_pending
  order by ids.ord;
$function$;

-- ---------------------------------------------------------------------------
-- 4. get_today_activity_counts: due_today/due_learning must agree with get_due_cards about what
--    actually counts as due right now, or the /study progress bar and dashboard stats would
--    count a still-pending pack member that get_due_cards itself will never serve -- the exact
--    inconsistency 20260830_vocab_batch_pending_flag.sql already had to avoid for pending_batch.
-- ---------------------------------------------------------------------------
create or replace function public.get_today_activity_counts(p_user_id uuid, p_timezone text default 'UTC')
returns table(due_today integer, due_learning integer, reviewed_today integer, new_kanji_today integer, new_vocab_today integer, new_hiragana_today integer, new_katakana_today integer)
language plpgsql
stable
as $function$
declare
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
  v_study_track text;
begin
  select study_track into v_study_track from public.user_study_settings where user_id = p_user_id;

  return query
  select
    (
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pending_batch)
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pack_pending) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pack_pending)
      else 0 end
    )::integer,
    (
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pending_batch)
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pack_pending) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pack_pending)
      else 0 end
    )::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. introduce_hiragana/introduce_katakana: insert as pack_pending = true, then check whether
--    every study_enabled entry_kind = 'character' row sharing this gojuon_row now has a
--    progress row for this user. If so, bulk-release the WHOLE pack (pack_pending = false,
--    due_at = now()) in the same statement -- this is what makes pack completion durable and
--    session-independent: whichever call (this session or a future one) happens to introduce the
--    last missing character is the one that releases every sibling, including ones introduced
--    long before. Return type changes from void to (pack_completed, ids), so both are dropped
--    and recreated.
-- ---------------------------------------------------------------------------
drop function if exists public.introduce_hiragana(uuid, bigint, text, bigint);

create function public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(pack_completed boolean, hiragana_ids bigint[])
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
  v_gojuon_row text;
  v_pack_total integer;
  v_pack_done integer;
  v_completed boolean := false;
  v_ids bigint[] := null;
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

  select gojuon_row into v_gojuon_row from public.hiragana where id = p_hiragana_id;

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
        and h.gojuon_row = v_gojuon_row
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

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at, pack_pending)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now(), true);

  select count(*) into v_pack_total
  from public.hiragana
  where gojuon_row = v_gojuon_row and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_hiragana_progress p
  join public.hiragana h on h.id = p.hiragana_id
  where p.user_id = p_user_id
    and h.gojuon_row = v_gojuon_row
    and h.entry_kind = 'character'
    and h.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_hiragana_progress p
    set pack_pending = false, due_at = now()
    from public.hiragana h
    where p.hiragana_id = h.id
      and p.user_id = p_user_id
      and h.gojuon_row = v_gojuon_row
      and h.entry_kind = 'character'
      and h.study_enabled;

    select array_agg(h.id order by h.sort_order) into v_ids
    from public.hiragana h
    where h.gojuon_row = v_gojuon_row and h.entry_kind = 'character' and h.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$function$;

drop function if exists public.introduce_katakana(uuid, bigint, text, bigint);

create function public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(pack_completed boolean, katakana_ids bigint[])
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
  v_gojuon_row text;
  v_pack_total integer;
  v_pack_done integer;
  v_completed boolean := false;
  v_ids bigint[] := null;
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

  select gojuon_row into v_gojuon_row from public.katakana where id = p_katakana_id;

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
        and k.gojuon_row = v_gojuon_row
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

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at, pack_pending)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now(), true);

  select count(*) into v_pack_total
  from public.katakana
  where gojuon_row = v_gojuon_row and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_katakana_progress p
  join public.katakana k on k.id = p.katakana_id
  where p.user_id = p_user_id
    and k.gojuon_row = v_gojuon_row
    and k.entry_kind = 'character'
    and k.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_katakana_progress p
    set pack_pending = false, due_at = now()
    from public.katakana k
    where p.katakana_id = k.id
      and p.user_id = p_user_id
      and k.gojuon_row = v_gojuon_row
      and k.entry_kind = 'character'
      and k.study_enabled;

    select array_agg(k.id order by k.sort_order) into v_ids
    from public.katakana k
    where k.gojuon_row = v_gojuon_row and k.entry_kind = 'character' and k.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$function$;

grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.get_hiragana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.get_katakana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.get_today_activity_counts(uuid, text) to authenticated;
grant execute on function public.introduce_hiragana(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_katakana(uuid, bigint, text, bigint) to authenticated;
