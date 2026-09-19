-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Makes every "what is due?" number the app shows come from ONE definition of eligibility.
--
-- Bug this fixes: a student who turned hiragana OFF in Settings (study_hiragana = false) while
-- some hiragana cards were still scheduled saw "You have 5 cards to do today" and an enabled
-- "Start studying" button, but /study came back with an empty queue (get_due_cards skips a
-- category whose study_* flag is off) and immediately bounced them back to /dashboard -- forever,
-- since those cards stay due but are never served.
--
-- Root cause: three RPCs each re-implemented "which progress rows count as due" on their own, and
-- only get_due_cards honoured the per-category study_* flags, enabled_levels and
-- vocabulary.study_enabled (get_next_due honoured the kana flags only):
--   * get_due_cards             -- what /study serves.
--   * get_today_activity_counts -- due_today/due_learning -> cardsRemainingToday -> the dashboard's
--                                  "N cards" / allDone / button state; counted every row of the
--                                  track's tables with no flag, level or study_enabled check.
--   * get_next_due             -- next_due_at countdown; no kanji/vocabulary flag, track, level or
--                                  study_enabled check.
--
-- Fix: get_eligible_due_rows is now the single place that decides whether a progress row may be
-- quizzed (it is the WHERE-clause logic get_due_cards used to carry inline, minus the due_at
-- window and the row limit), and all three RPCs read from it:
--   * get_due_cards             -- semi-joins its five branches to the helper instead of repeating
--                                  the predicates; output columns, ordering and the 10-minute
--                                  grace fallback are unchanged (still takes p_enabled_levels from
--                                  the caller, which the helper honours when given).
--   * get_today_activity_counts -- counts from the helper (only rows already due, so the
--                                  (user_id, due_at) indexes still apply).
--   * get_next_due              -- soonest not-yet-due row from the helper.
-- A change to eligibility now happens in one function, so the two sides can no longer drift.
--
-- Not SECURITY DEFINER, same as get_due_cards: RLS on the progress tables still scopes every read
-- to the caller's own rows. All four functions keep their signatures/RETURNS TABLE shapes except
-- the helper itself, whose first version (a single p_user_id argument, applied earlier from this
-- same file) is dropped first so the two-argument version below can't be ambiguous with it.
-- Everything in get_today_activity_counts other than due_today/due_learning (reviewed_today,
-- new_*_today, the day-bounds logic) is copied unchanged from the LIVE definition, which already
-- matches 20261234_early_repeat_near_due_learning_cards.sql. get_due_cards is rebuilt from the LIVE
-- definition as well (also identical to 20261234's), with only the eligibility predicates moved.
--
-- Wrapped in one transaction so the DROP + re-creates land atomically.

begin;

drop function if exists public.get_eligible_due_rows(uuid);

create or replace function public.get_eligible_due_rows(p_user_id uuid, p_enabled_levels text[] default null)
 returns table(exercise_type text, progress_id bigint, due_at timestamp with time zone, status text)
 language sql
 stable
as $function$
  with s as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana,
           coalesce(p_enabled_levels, enabled_levels) as enabled_levels
    from public.user_study_settings
    where user_id = p_user_id
  )
  select 'kanji_meaning'::text, p.id, p.due_at, p.status
  from public.user_kanji_meaning_progress p
  join public.kanji k on k.id = p.kanji_id
  cross join s
  where s.study_track = 'standard'
    and s.study_kanji
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and k.level = any(s.enabled_levels)

  union all

  select 'kanji_reading'::text, p.id, p.due_at, p.status
  from public.user_kanji_reading_progress p
  join public.kanji_word kw on kw.id = p.kanji_word_id
  join public.kanji k on k.id = p.kanji_id
  join public.vocabulary v on v.id = kw.id_word
  cross join s
  where s.study_track = 'standard'
    and s.study_kanji
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and k.level = any(s.enabled_levels)
    and v.study_enabled

  union all

  select 'vocab_meaning'::text, p.id, p.due_at, p.status
  from public.user_vocabulary_progress p
  join public.vocabulary v on v.id = p.word_id
  cross join s
  where s.study_track = 'standard'
    and s.study_vocabulary
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pending_batch
    and v.jlpt_level = any(s.enabled_levels)
    and v.study_enabled

  union all

  select 'hiragana_reading'::text, p.id, p.due_at, p.status
  from public.user_hiragana_progress p
  join public.hiragana h on h.id = p.hiragana_id
  cross join s
  where s.study_track = 'kana'
    and s.study_hiragana
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pack_pending

  union all

  select 'katakana_reading'::text, p.id, p.due_at, p.status
  from public.user_katakana_progress p
  join public.katakana k on k.id = p.katakana_id
  cross join s
  where s.study_track = 'kana'
    and s.study_katakana
    and p.user_id = p_user_id
    and p.status != 'suspended'
    and not p.pack_pending;
$function$;

CREATE OR REPLACE FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 LANGUAGE sql
 STABLE
AS $function$
  with eligible as (
    -- Which progress rows this user may be quizzed on at all (study track and study_* flags,
    -- enabled levels, suspended, study_enabled, pending vocab batch / kana pack) is decided ONLY
    -- by get_eligible_due_rows -- the same helper get_today_activity_counts and get_next_due read,
    -- so /study's queue and the dashboard's counts can't disagree. Bounded to the widest window
    -- this function ever serves (strict due_at <= now(), or the 10-minute learning grace below).
    select e.exercise_type, e.progress_id
    from public.get_eligible_due_rows(p_user_id, p_enabled_levels) e
    where e.due_at <= now() + interval '10 minutes'
  ),
  candidates as (
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
      null::boolean as usually_kana,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'kanji_meaning')

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
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
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
          and (
            exists (
              select 1
              from public.kanji_word kw3
              join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
              where kw3.id_kanji = kw2.id_kanji
                and kw3.reading_group = kw2.reading_group
                and p3.user_id = p_user_id
                and p3.status = 'review'
                and p3.repetitions >= 2
            )
            or (
              k2.level is not null
              and k.level is not null
              and array_position(array['N5','N4','N3','N2','N1'], k2.level)
                < array_position(array['N5','N4','N3','N2','N1'], k.level)
            )
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'kanji_reading')

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
      v.usually_kana,
      public.vocabulary_primary_meanings(v) as primary_word_meanings,
      public.get_vocab_meaning_pool(v.word, v.kana_reading) as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::boolean as drill_enabled,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'vocab_meaning')

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
      null::boolean,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji, h.kana_type,
      h.drill_enabled,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'hiragana_reading')

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
      null::boolean,
      null::text[] as primary_word_meanings,
      null::text[] as all_primary_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji, k.kana_type,
      k.drill_enabled,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    where p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.id in (select e.progress_id from eligible e where e.exercise_type = 'katakana_reading')
  ),
  -- Whether this user has anything genuinely due right now, across every candidate row above --
  -- the grace window (due_at between now() and now()+10min) only ever applies when this is false.
  has_strict as (
    select exists(select 1 from candidates c where c.due_at <= now()) as strict_exists
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, usually_kana, primary_word_meanings, all_primary_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
         coalesce(status = 'learning' and drill_enabled, false) as drill_mode,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from candidates, has_strict
  where has_strict.strict_exists = false or candidates.due_at <= now()
  order by candidates.due_at asc
  limit p_limit;
$function$;

create or replace function public.get_today_activity_counts(p_user_id uuid, p_timezone text default 'UTC'::text)
 returns table(due_today integer, due_learning integer, reviewed_today integer, new_kanji_today integer, new_vocab_today integer, new_hiragana_today integer, new_katakana_today integer)
 language plpgsql
 stable
as $function$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_due_today integer;
  v_due_learning integer;
begin
  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  -- The WHERE (not just FILTER clauses) is what lets the planner push due_at into the helper's
  -- per-table scans and use the (user_id, due_at) indexes instead of reading the student's whole
  -- history on every dashboard load.
  select count(*), count(*) filter (where r.status in ('learning', 'relearning'))
  into v_due_today, v_due_learning
  from public.get_eligible_due_rows(p_user_id) r
  where r.due_at <= now();

  -- Nothing genuinely due right now: fall back to learning/relearning rows resurfacing within
  -- their maximum possible wait (10 minutes -- LEARNING_STEPS_MINUTES), so this agrees with
  -- get_due_cards' own fallback instead of telling a caught-up student to keep waiting for a card
  -- /study would already hand them. Every row counted here is learning/relearning by
  -- construction, so it becomes both due_today and due_learning outright.
  if v_due_today = 0 then
    select count(*) into v_due_today
    from public.get_eligible_due_rows(p_user_id) r
    where r.status in ('learning', 'relearning') and r.due_at <= now() + interval '10 minutes';
    v_due_learning := v_due_today;
  end if;

  return query
  select
    v_due_today::integer,
    v_due_learning::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$function$;

create or replace function public.get_next_due(p_user_id uuid, p_timezone text default 'UTC'::text)
 returns table(next_due_at timestamp with time zone, next_due_is_today boolean, next_due_status text)
 language plpgsql
 stable
as $function$
declare
  v_next_due_at timestamptz;
  v_next_due_status text;
  v_day_end timestamptz;
begin
  select day_end into v_day_end from public.study_day_bounds(p_timezone);

  select r.due_at, r.status into v_next_due_at, v_next_due_status
  from public.get_eligible_due_rows(p_user_id) r
  where r.due_at > now()
  order by r.due_at asc
  limit 1;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end), v_next_due_status;
end;
$function$;

commit;

-- Parity check (read-only) -- run after any change to eligibility. Every row must have
-- due_today_ok = true: get_due_cards' row count for a user must equal what the dashboard is told
-- is due (the grace-window fallback is applied identically on both sides).
--
-- select left(s.user_id::text, 8) as user,
--        s.study_track,
--        (select count(*) from public.get_due_cards(s.user_id, s.enabled_levels, s.study_kanji, s.study_vocabulary, s.study_hiragana, s.study_katakana, 100000)) as get_due_cards_rows,
--        (select due_today from public.get_today_activity_counts(s.user_id, 'UTC')) as due_today,
--        (select count(*) from public.get_due_cards(s.user_id, s.enabled_levels, s.study_kanji, s.study_vocabulary, s.study_hiragana, s.study_katakana, 100000))
--          = (select due_today from public.get_today_activity_counts(s.user_id, 'UTC')) as due_today_ok
-- from public.user_study_settings s
-- order by 1;
