-- Run this manually in DBeaver or the Supabase SQL editor (after 20260916_user_badges.sql).
--
-- Widens what counts as "studied today" for the streak number, the streak record, and the
-- WeekStreak flame strip: previously all three only looked at public.review_logs (a graded
-- quiz answer), so introducing a new character/word/kanji -- the "New hiragana" style card,
-- which has a single Next button and never reaches submit_review -- did nothing for any of
-- them, even though from the user's point of view they just studied. Now a day also counts if
-- the user introduced at least one new card that day, via any of:
--   user_hiragana_progress, user_katakana_progress   (introduce_hiragana/introduce_katakana)
--   user_kanji_meaning_progress                      (introduce_kanji)
--   user_vocabulary_progress                         (introduce_vocabulary)
--   user_hiragana_rule_progress, user_katakana_rule_progress (introduce_hiragana_rule/_katakana_rule)
-- user_kanji_reading_progress is deliberately omitted -- introduce_kanji always inserts it in
-- the same statement/same day as user_kanji_meaning_progress, so it can never mark a day active
-- on its own.
--
-- 1. get_review_streak (live "Day streak" number) and get_review_streak_record ("Best streak")
--    now share one definition of "active day" via the new get_streak_active_days helper below,
--    so the two can't drift apart on what counts. Both stay UTC/server-clock-based (no
--    p_timezone param) -- unchanged from 20260819_review_streak_set_based.sql, which left this
--    as a known quirk vs. get_review_activity's timezone awareness rather than risk changing the
--    existing streak number.
--
-- 2. get_review_streak_record used to read leaderboard_stats.longest_streak, kept incrementally
--    up to date by the leaderboard_stats_on_review_insert trigger (20260909_streak_record.sql)
--    purely for O(1) reads. That trigger only fires on review_logs inserts, so it has no way to
--    hear about introductions without a matching trigger on all six progress tables above --
--    meaningfully more surface area (six new trigger functions plus six new triggers) on a
--    hot path (every graded review) for a feature (introductions) that never touches XP/
--    reviews_count anyway. Recomputing the record the same way get_review_streak already
--    recomputes the live number -- just without the "must end today" filter -- avoids that,
--    at the cost of scanning full history per call instead of O(1); acceptable pre-launch ("No
--    real users yet" -- 20260909_streak_record.sql), same tradeoff get_review_streak itself
--    already made. leaderboard_stats.longest_streak/current_streak are untouched here (still
--    maintained for the leaderboard's own display of other users' streaks) -- only
--    get_review_streak_record's source changes.
--
-- 3. get_review_activity (the 7-day flame strip) gets the same six-table union, timezone-aware
--    like the rest of that function already is.

create or replace function public.get_streak_active_days(p_user_id uuid)
returns table (d date)
language sql
stable
as $$
  select distinct d from (
    select reviewed_at::date as d from public.review_logs
      where user_id = p_user_id and undone = false
    union
    select created_at::date from public.user_hiragana_progress where user_id = p_user_id
    union
    select created_at::date from public.user_katakana_progress where user_id = p_user_id
    union
    select created_at::date from public.user_kanji_meaning_progress where user_id = p_user_id
    union
    select created_at::date from public.user_vocabulary_progress where user_id = p_user_id
    union
    select seen_at::date from public.user_hiragana_rule_progress where user_id = p_user_id
    union
    select seen_at::date from public.user_katakana_rule_progress where user_id = p_user_id
  ) dates;
$$;

grant execute on function public.get_streak_active_days(uuid) to authenticated;

create or replace function public.get_review_streak(p_user_id uuid)
returns integer
language sql
stable
as $$
  with active_days as (
    select d from public.get_streak_active_days(p_user_id) where d <= current_date
  ),
  grp as (
    select d, d - (row_number() over (order by d))::integer as grp
    from active_days
  ),
  runs as (
    select max(d) as run_end, count(*) as run_len
    from grp
    group by grp
  )
  select coalesce((select run_len from runs where run_end = current_date), 0);
$$;

-- No longer security definer / auth.uid()-gated: unlike before, this doesn't read
-- leaderboard_stats (RLS-enabled with no policies, which is why the old version needed to
-- bypass RLS and check auth.uid() itself) -- get_streak_active_days' own sources all carry
-- ordinary "user manages own rows" RLS policies, the same protection get_review_streak above
-- has always relied on.
create or replace function public.get_review_streak_record(p_user_id uuid)
returns integer
language sql
stable
as $$
  with grp as (
    select d, d - (row_number() over (order by d))::integer as grp
    from public.get_streak_active_days(p_user_id)
  )
  select coalesce(max(run_len), 0)
  from (
    select count(*) as run_len from grp group by grp
  ) runs;
$$;

grant execute on function public.get_review_streak_record(uuid) to authenticated;

create or replace function public.get_review_activity(
  p_user_id uuid,
  p_timezone text,
  p_days integer default 7
)
returns table (
  day date,
  has_activity boolean
)
language sql
stable
as $$
  with days as (
    select generate_series(
      (now() at time zone p_timezone)::date - (p_days - 1),
      (now() at time zone p_timezone)::date,
      interval '1 day'
    )::date as day
  ),
  activity_at as (
    select reviewed_at as at from public.review_logs
      where user_id = p_user_id and undone = false
    union all
    select created_at from public.user_hiragana_progress where user_id = p_user_id
    union all
    select created_at from public.user_katakana_progress where user_id = p_user_id
    union all
    select created_at from public.user_kanji_meaning_progress where user_id = p_user_id
    union all
    select created_at from public.user_vocabulary_progress where user_id = p_user_id
    union all
    select seen_at from public.user_hiragana_rule_progress where user_id = p_user_id
    union all
    select seen_at from public.user_katakana_rule_progress where user_id = p_user_id
  )
  select
    d.day,
    exists (
      select 1 from activity_at a
      where (a.at at time zone p_timezone)::date = d.day
    ) as has_activity
  from days d
  order by d.day asc;
$$;

grant execute on function public.get_review_activity(uuid, text, integer) to authenticated;
