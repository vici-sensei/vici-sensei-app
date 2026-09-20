-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Makes "Max reviews per day" (user_study_settings.max_reviews_per_day) actually limit reviews.
--
-- Until now the setting was only the p_limit of every get_due_cards call: the queue held at most
-- that many cards at a time, but refreshQueue refills it after every answer, so a student with 80
-- reviews due and a limit of 50 still did all 80 in one sitting -- the setting limited nothing.
--
-- What it means now: cards that belong to a pack are never limited -- a pack card is anything
-- with status 'learning' (the kanji intro bundle, the vocabulary batch, kana packs and their
-- drills, example packs), because those are what teaches a new item. Everything else is an "old"
-- card that was already learned -- status 'review', or 'relearning' after a lapse -- and only
-- those are limited: the student is served the oldest-due ones, up to
--   max_reviews_per_day - (answers today whose card was 'review' or 'relearning' at answer time).
-- How many new packs arrive per day is still controlled by the new_*_per_day settings.
--
-- "Answers today" is read from review_logs (status_before in ('review', 'relearning'), not
-- undone, inside the same 6 a.m. study day get_today_activity_counts already uses for
-- reviewed_today). Nothing that belongs to a pack ever lands in that count: pack answers are
-- logged with status_before = 'learning', and kana drill answers and introductions never write
-- review_logs at all.
--
-- One shared rule, three readers (same idea as 20261240):
--   get_daily_review_budget    -- how many old-card answers are left today.
--   get_servable_due_rows      -- get_eligible_due_rows within the due window, minus the old cards
--                                 past the budget (oldest-due first). Rows in the 10-minute learning
--                                 grace window rank with everything else, so they never jump the
--                                 queue ahead of a card that is strictly due.
--   get_due_cards              -- semi-joins its five branches to get_servable_due_rows (was
--                                 get_eligible_due_rows); output columns, ordering and the grace
--                                 fallback are unchanged. p_limit stays as a plain upper bound.
--   get_today_activity_counts  -- due_today/due_learning count from get_servable_due_rows, so the
--                                 dashboard shows what /study will actually serve.
--   get_next_due               -- an old card due later today only counts as "next" while it still
--                                 fits in the remaining budget; old cards due from the next study
--                                 day on always count (fresh budget).
--
-- get_due_cards gains a trailing p_timezone (default 'UTC') because the study day is per
-- timezone and the budget needs it; a caller that doesn't send it (an old cached client) still
-- works. Adding a defaulted parameter would leave the 7-argument version ambiguous next to the new
-- one, so it is dropped first. Every function stays non-SECURITY DEFINER: RLS still scopes each
-- read to the caller's own rows.
--
-- Wrapped in one transaction so the DROP + re-creates land atomically.

begin;

drop function if exists public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer);

create or replace function public.get_daily_review_budget(p_user_id uuid, p_timezone text default 'UTC'::text)
 returns integer
 language sql
 stable
as $function$
  select greatest(
    coalesce((select s.max_reviews_per_day from public.user_study_settings s where s.user_id = p_user_id), 0)
    - (
      select count(*)
      from public.review_logs l
      cross join public.study_day_bounds(p_timezone) d
      where l.user_id = p_user_id
        and not l.undone
        and l.status_before in ('review', 'relearning')
        and l.reviewed_at >= d.day_start
        and l.reviewed_at < d.day_end
    ),
    0
  )::integer;
$function$;

create or replace function public.get_servable_due_rows(p_user_id uuid, p_enabled_levels text[] default null, p_timezone text default 'UTC'::text)
 returns table(exercise_type text, progress_id bigint, due_at timestamp with time zone, status text)
 language sql
 stable
as $function$
  with budget as (
    select public.get_daily_review_budget(p_user_id, p_timezone) as remaining
  ),
  windowed as (
    select r.exercise_type, r.progress_id, r.due_at, r.status,
           r.status in ('review', 'relearning') as is_old
    from public.get_eligible_due_rows(p_user_id, p_enabled_levels) r
    where r.due_at <= now() + interval '10 minutes'
  ),
  ranked as (
    select w.exercise_type, w.progress_id, w.due_at, w.status, w.is_old,
           row_number() over (partition by w.is_old order by w.due_at, w.exercise_type, w.progress_id) as old_rank
    from windowed w
  )
  select k.exercise_type, k.progress_id, k.due_at, k.status
  from ranked k
  cross join budget b
  where not k.is_old or k.old_rank <= b.remaining;
$function$;

CREATE OR REPLACE FUNCTION public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer, p_timezone text DEFAULT 'UTC'::text)
 RETURNS TABLE(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], usually_kana boolean, primary_word_meanings text[], all_primary_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, drill_mode boolean, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 LANGUAGE sql
 STABLE
AS $function$
  with eligible as (
    -- Which progress rows this user is served right now is decided ONLY by get_servable_due_rows
    -- (eligibility from get_eligible_due_rows, plus the daily cap on already-learned cards) -- the
    -- same helper get_today_activity_counts and get_next_due read, so /study's queue and the
    -- dashboard's counts can't disagree. Already bounded to the widest window this function ever
    -- serves (strict due_at <= now(), or the 10-minute learning grace below).
    select e.exercise_type, e.progress_id
    from public.get_servable_due_rows(p_user_id, p_enabled_levels, p_timezone) e
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

  -- get_servable_due_rows is already bounded to the due window; this WHERE just keeps the
  -- strictly-due rows.
  select count(*), count(*) filter (where r.status in ('learning', 'relearning'))
  into v_due_today, v_due_learning
  from public.get_servable_due_rows(p_user_id, null, p_timezone) r
  where r.due_at <= now();

  -- Nothing genuinely due right now: fall back to learning/relearning rows resurfacing within
  -- their maximum possible wait (10 minutes -- LEARNING_STEPS_MINUTES), so this agrees with
  -- get_due_cards' own fallback instead of telling a caught-up student to keep waiting for a card
  -- /study would already hand them. Every row counted here is learning/relearning by
  -- construction, so it becomes both due_today and due_learning outright.
  if v_due_today = 0 then
    select count(*) into v_due_today
    from public.get_servable_due_rows(p_user_id, null, p_timezone) r
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
  v_budget integer;
begin
  select day_end into v_day_end from public.study_day_bounds(p_timezone);
  v_budget := public.get_daily_review_budget(p_user_id, p_timezone);

  select t.due_at, t.status into v_next_due_at, v_next_due_status
  from (
    -- Pack cards ('learning'): never limited.
    select r.due_at, r.status
    from public.get_eligible_due_rows(p_user_id) r
    where r.status not in ('review', 'relearning') and r.due_at > now()

    union all

    -- Old cards due later today: only while they still fit in today's remaining budget. Ranked
    -- together with the ones already due (which take the budget first, oldest-due first), the same
    -- order get_servable_due_rows uses.
    select o.due_at, o.status
    from (
      select r.due_at, r.status,
             row_number() over (order by r.due_at, r.exercise_type, r.progress_id) as rn
      from public.get_eligible_due_rows(p_user_id) r
      where r.status in ('review', 'relearning') and r.due_at < v_day_end
    ) o
    where o.due_at > now() and o.rn <= v_budget

    union all

    -- Old cards due from the next study day on: a fresh budget by then.
    select r.due_at, r.status
    from public.get_eligible_due_rows(p_user_id) r
    where r.status in ('review', 'relearning') and r.due_at >= v_day_end
  ) t
  order by t.due_at asc
  limit 1;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end), v_next_due_status;
end;
$function$;

commit;

-- Parity check (read-only) -- run after any change to eligibility or to the daily cap. Every row
-- must have due_today_ok = true: get_due_cards' row count for a user (timezone included, so the
-- study day matches) must equal what the dashboard is told is due.
--
-- select left(s.user_id::text, 8) as user,
--        s.study_track,
--        s.max_reviews_per_day,
--        public.get_daily_review_budget(s.user_id, 'UTC') as budget_left,
--        (select count(*) from public.get_due_cards(s.user_id, s.enabled_levels, s.study_kanji, s.study_vocabulary, s.study_hiragana, s.study_katakana, 100000, 'UTC')) as get_due_cards_rows,
--        (select due_today from public.get_today_activity_counts(s.user_id, 'UTC')) as due_today,
--        (select count(*) from public.get_due_cards(s.user_id, s.enabled_levels, s.study_kanji, s.study_vocabulary, s.study_hiragana, s.study_katakana, 100000, 'UTC'))
--          = (select due_today from public.get_today_activity_counts(s.user_id, 'UTC')) as due_today_ok
-- from public.user_study_settings s
-- order by 1;
