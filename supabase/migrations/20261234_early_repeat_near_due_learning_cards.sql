-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets a caught-up student repeat a learning/relearning card early instead of watching a
-- countdown for it: LEARNING_STEPS_MINUTES ([1, 10], lib/srs/constants.ts) caps how long a
-- learning-phase card's due_at can ever be from "now", so once nothing else is genuinely due
-- for this user, any learning/relearning row is already at most 10 minutes out. Both functions
-- below widen due_at <= now() to due_at <= now() + interval '10 minutes' for status in
-- ('learning','relearning') rows, but ONLY as a fallback when the strict (due_at <= now()) set
-- is empty -- so during a normal session, with real cards still due, the 1/10-minute spacing
-- between learning steps is untouched (this never lets a student re-answer the same card back
-- to back). Review-phase cards are never affected: their intervals are days, not minutes, so
-- this grace window is irrelevant to them.
--
-- Both functions must move together: get_due_cards decides what /study's queue and the
-- dashboard's first-card prefetch (fetchFirstDueCard) hand back, while get_today_activity_counts
-- feeds due_today/due_learning into cardsRemainingToday -> allDone (DashboardHero, StudyStatsContext) --
-- patching only one would let the dashboard's "You're all done, next card in Xm" screen
-- disagree with what /study would actually show if the student clicked into it.
--
-- get_due_cards keeps its existing signature and RETURNS TABLE shape, so CREATE OR REPLACE is
-- enough -- no drop needed. Body is otherwise identical to the live definition in
-- 20261230_usually_kana_on_review_cards.sql.

CREATE OR REPLACE FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 LANGUAGE sql
 STABLE
AS $function$
  with settings as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana
    from public.user_study_settings
    where user_id = p_user_id
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
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
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
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)
      and v.study_enabled

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
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_vocabulary
      and p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.status != 'suspended'
      and not p.pending_batch
      and v.jlpt_level = any(p_enabled_levels)
      and v.study_enabled

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
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_hiragana
      and p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
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
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_katakana
      and p.user_id = p_user_id
      and (p.due_at <= now() or (p.status in ('learning', 'relearning') and p.due_at <= now() + interval '10 minutes'))
      and p.status != 'suspended'
      and not p.pack_pending
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

-- Same "grace window only as a fallback when nothing is strictly due" rule, applied to
-- due_today/due_learning (the counts DashboardHero's allDone/cardsToday are built from --
-- lib/study/stats.ts's cardsRemainingToday).
--
-- Base body taken from the LIVE definition (checked via `supabase db query --linked
-- "select pg_get_functiondef(oid) from pg_proc where proname = 'get_today_activity_counts'"`),
-- not from 20260910_persist_kana_pack_completion.sql's copy in this repo -- that file's day-start/
-- day-end computation is stale (predates 20260903_study_day_6am_boundary.sql's switch to the
-- study_day_bounds() helper), and since migrations here are applied by hand in DBeaver rather
-- than `db push`, the live function had already moved on past what that file shows. Everything
-- below is unchanged from live except the new v_due_today/v_due_learning/v_grace_learning grace
-- logic. Signature/RETURNS TABLE unchanged, so CREATE OR REPLACE is enough.
CREATE OR REPLACE FUNCTION public.get_today_activity_counts(p_user_id uuid, p_timezone text DEFAULT 'UTC'::text)
 RETURNS TABLE(due_today integer, due_learning integer, reviewed_today integer, new_kanji_today integer, new_vocab_today integer, new_hiragana_today integer, new_katakana_today integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_study_track text;
  v_due_today integer;
  v_due_learning integer;
  v_grace_learning integer;
begin
  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);
  select study_track into v_study_track from public.user_study_settings where user_id = p_user_id;

  v_due_today :=
    case when v_study_track = 'standard' then
      (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
      (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
      (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pending_batch)
    else 0 end
    +
    case when v_study_track = 'kana' then
      (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pack_pending) +
      (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended' and not pack_pending)
    else 0 end;

  v_due_learning :=
    case when v_study_track = 'standard' then
      (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
      (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
      (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pending_batch)
    else 0 end
    +
    case when v_study_track = 'kana' then
      (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pack_pending) +
      (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning') and not pack_pending)
    else 0 end;

  -- Nothing genuinely due right now: fall back to learning/relearning rows resurfacing within
  -- their maximum possible wait (10 minutes -- LEARNING_STEPS_MINUTES), so this agrees with
  -- get_due_cards' own fallback above instead of telling a caught-up student to keep waiting for
  -- a card /study would already hand them. Every row counted here is learning/relearning by
  -- construction, so it becomes both due_today and due_learning outright.
  if v_due_today = 0 then
    v_grace_learning :=
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and status in ('learning','relearning') and due_at <= now() + interval '10 minutes') +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and status in ('learning','relearning') and due_at <= now() + interval '10 minutes') +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and status in ('learning','relearning') and due_at <= now() + interval '10 minutes' and not pending_batch)
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and status in ('learning','relearning') and due_at <= now() + interval '10 minutes' and not pack_pending) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and status in ('learning','relearning') and due_at <= now() + interval '10 minutes' and not pack_pending)
      else 0 end;
    v_due_today := v_grace_learning;
    v_due_learning := v_grace_learning;
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
