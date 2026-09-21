-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- The admin Students table and the student detail page showed leaderboard_stats.current_streak
-- exactly as stored. That column is only rewritten when the student is next active, so after a
-- streak has actually broken it keeps the last value forever (Cezara: 12 stored, last active
-- Sep 18, then Sep 19 and 20 missed on top of the Sep 15 free day = a 3rd inactive day inside 7
-- days, so the real streak is 0). The dashboard and the leaderboard never show the raw column:
-- both pass it through streak_display_count (20261128_streak_weekly_free_days.sql), which walks
-- forward from last_active_date and returns 0 once the free-day budget is blown. This makes the
-- admin pages do the same, so all three places always agree.
--
--   1. get_admin_student_roster -- current_streak is now streak_display_count(...) evaluated at
--      "today" in each student's own timezone, the same coalesce(timezone, 'UTC') that
--      get_leaderboard_streak uses. Same signature and columns, so it is a plain replace.
--      longest_streak is still the stored value (the Students table doesn't show it).
--   2. get_admin_student_streaks -- new, for the detail page: the displayed current streak (as
--      above) plus the "best streak" the student's own dashboard shows, which is
--      get_review_streak_record -- the longest run of consecutive active days, NOT the stored
--      leaderboard_stats.longest_streak (that one counts straight through a free day, so it
--      reads 12 where the dashboard reads 9).
--
-- Neither function is security definer: like the rest of the admin reads they rely on the "Admins
-- can view ..." RLS policies from 20261112_admin_can_view_student_data.sql, so a non-admin caller
-- only ever sees their own rows.
--
-- Read-only functions, no data changes, no signature change on the roster.

begin;

create or replace function public.get_admin_student_roster()
returns table(
  id uuid,
  display_name text,
  email text,
  avatar_url text,
  country text,
  is_premium boolean,
  created_at timestamptz,
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  reviews_count bigint,
  new_cards_count bigint,
  learned_count bigint,
  practice_count bigint,
  test_count bigint,
  xp_points bigint
)
language sql
stable
as $$
  select
    u.id, u.display_name, u.email, u.avatar_url, u.country, u.is_premium, u.created_at,
    public.streak_display_count(
      ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
      public.study_day(now(), coalesce(s.timezone, 'UTC'))
    ),
    coalesce(ls.longest_streak, 0), ls.last_active_date,
    coalesce(ls.reviews_count, 0), coalesce(ls.new_cards_count, 0),
    coalesce(learned.cnt, 0), coalesce(practice.cnt, 0), coalesce(ls.test_count, 0),
    coalesce(ls.xp_points, 0)
  from public.users u
  left join public.leaderboard_stats ls on ls.user_id = u.id
  left join public.user_study_settings s on s.user_id = u.id
  left join (
    select user_id, count(*) as cnt from (
      select user_id from public.user_hiragana_progress where graduated_at is not null
      union all
      select user_id from public.user_katakana_progress where graduated_at is not null
    ) g group by user_id
  ) learned on learned.user_id = u.id
  left join (
    select user_id, count(*) as cnt from public.practice_logs group by user_id
  ) practice on practice.user_id = u.id;
$$;

grant execute on function public.get_admin_student_roster() to authenticated;

create or replace function public.get_admin_student_streaks(p_user_id uuid)
returns table(current_streak integer, longest_streak integer)
language sql
stable
as $$
  with tz as (
    select coalesce((select s.timezone from public.user_study_settings s where s.user_id = p_user_id), 'UTC') as name
  )
  select
    coalesce(
      (select public.streak_display_count(
         ls.current_streak, ls.last_active_date, ls.streak_recent_inactive,
         public.study_day(now(), (select name from tz))
       )
       from public.leaderboard_stats ls
       where ls.user_id = p_user_id),
      0
    ),
    public.get_review_streak_record(p_user_id, (select name from tz));
$$;

grant execute on function public.get_admin_student_streaks(uuid) to authenticated;

commit;
