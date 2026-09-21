-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_student_new_card_progress: everything the admin student detail page's "New cards progress"
-- chart needs, in one round trip. Read-only, additive (one new function, nothing else touched).
--
-- What counts as a "new card": one INSERT into user_kanji_meaning_progress, user_vocabulary_progress,
-- user_hiragana_progress or user_katakana_progress -- exactly the four tables leaderboard_stats_on_new_card
-- bumps leaderboard_daily_stats.new_cards_count for. user_kanji_reading_progress is deliberately NOT
-- counted: those rows are the reading cards that fan out from introducing one kanji, not new items.
--
-- Why the history comes from the progress tables' created_at and not from leaderboard_daily_stats:
-- the daily counter has no per-category or per-level breakdown, and the chart is filterable by study
-- track and JLPT level. The trade-off is that a progress row that was later deleted (a kana pack undone,
-- a reset) no longer exists, whereas the counter still counts it. counter_total is returned so the page
-- can tell the teacher how many cards can't be plotted for that reason.
--
-- Returned jsonb:
--   timezone       the student's effective timezone (user_study_settings.timezone, which mirrors the custom
--                  pick since 20261244), 'UTC' when unset -- same fallback get_student_daily_activity uses
--   join_day       study day (6 a.m. local, study_day()) the account was created on
--   today          the student's current study day
--   counter_total  sum(leaderboard_daily_stats.new_cards_count), every card ever introduced incl. undone ones
--   history        [{day, category, level, count}] new cards per study day/category/level. category is one
--                  of kanji | vocabulary | hiragana_reading | katakana_reading (same names get_level_progress
--                  uses); level is the JLPT level for kanji/vocabulary and null for kana and for the
--                  handful of vocabulary words without a level
--   pool           [{category, level, total}] how many cards exist to be introduced, by category and level:
--                  kanji by kanji.level, vocabulary by jlpt_level (study_enabled only, level not null --
--                  get_new_vocab_candidates never offers a level-less word), hiragana/katakana without rule
--                  entries (entry_kind != 'rule', study_enabled), same filter get_level_progress totals use
--   tests          [{day, test_type, attempt_number, percent}] hiragana/katakana reading tests, bucketed by
--                  study day, for the chart's test markers
-- Bucketing everything server-side means the client needs no timezone/study-day arithmetic of its own.
--
-- Plain SQL, stable, NOT security definer: relies entirely on RLS, same convention as
-- get_student_daily_activity, so it only returns rows an admin (or the student) may already read
-- (20261112_admin_can_view_student_data.sql covers every per-student table used here; the content tables
-- kanji/vocabulary/hiragana/katakana are readable by any authenticated user).

create or replace function public.get_student_new_card_progress(p_user_id uuid)
returns jsonb
language sql
stable
as $$
  with tz as (
    select coalesce((select timezone from public.user_study_settings where user_id = p_user_id), 'UTC') as tz
  ),
  intros as (
    select 'kanji'::text as category, k.level as level, public.study_day(p.created_at, (select tz from tz)) as day
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    where p.user_id = p_user_id
    union all
    select 'vocabulary', v.jlpt_level, public.study_day(p.created_at, (select tz from tz))
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    where p.user_id = p_user_id
    union all
    select 'hiragana_reading', null, public.study_day(p.created_at, (select tz from tz))
    from public.user_hiragana_progress p
    where p.user_id = p_user_id
    union all
    select 'katakana_reading', null, public.study_day(p.created_at, (select tz from tz))
    from public.user_katakana_progress p
    where p.user_id = p_user_id
  ),
  history as (
    select day, category, level, count(*)::integer as n
    from intros
    group by day, category, level
  ),
  pool as (
    select 'kanji'::text as category, k.level as level, count(*)::integer as total
    from public.kanji k
    group by k.level
    union all
    select 'vocabulary', v.jlpt_level, count(*)::integer
    from public.vocabulary v
    where v.study_enabled and v.jlpt_level is not null
    group by v.jlpt_level
    union all
    select 'hiragana_reading', null, count(*)::integer
    from public.hiragana h
    where h.entry_kind != 'rule' and h.study_enabled
    union all
    select 'katakana_reading', null, count(*)::integer
    from public.katakana k
    where k.entry_kind != 'rule' and k.study_enabled
  ),
  tests as (
    select public.study_day(ts.earned_at, (select tz from tz)) as day, ts.test_type, ts.attempt_number, ts.percent
    from public.test_status ts
    where ts.user_id = p_user_id and ts.test_type in ('hiragana', 'katakana')
  )
  select jsonb_build_object(
    'timezone', (select tz from tz),
    'join_day', (select public.study_day(u.created_at, (select tz from tz)) from public.users u where u.id = p_user_id),
    'today', public.study_day(now(), (select tz from tz)),
    'counter_total', (
      select coalesce(sum(lds.new_cards_count), 0)::integer
      from public.leaderboard_daily_stats lds
      where lds.user_id = p_user_id
    ),
    'history', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', h.day, 'category', h.category, 'level', h.level, 'count', h.n)
                  order by h.day, h.category, h.level),
        '[]'::jsonb)
      from history h
    ),
    'pool', (
      select coalesce(
        jsonb_agg(jsonb_build_object('category', p.category, 'level', p.level, 'total', p.total)
                  order by p.category, p.level),
        '[]'::jsonb)
      from pool p
    ),
    'tests', (
      select coalesce(
        jsonb_agg(jsonb_build_object('day', t.day, 'test_type', t.test_type,
                                     'attempt_number', t.attempt_number, 'percent', t.percent)
                  order by t.day, t.attempt_number),
        '[]'::jsonb)
      from tests t
    )
  );
$$;

grant execute on function public.get_student_new_card_progress(uuid) to authenticated;
