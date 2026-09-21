-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- /study/practice (usePracticeQueue.ts) has always been deliberately DB-write-free: rate() only
-- ever touched in-memory state, so a whole session of practice never moved the streak or XP,
-- despite the user clearly having studied. That was correct while practice was allowed to reuse
-- SRS state -- it never has -- but it also meant it couldn't count as "did you show up today"
-- either, unlike every other study activity (graded reviews, new cards, kana drilling, the
-- reading test).
--
-- Fix: a new insert-only log table, practice_logs, written once per card answered in Practice
-- mode (see lib/data/practiceLog.ts / usePracticeQueue.ts's rate()). It has no relationship to
-- any user_*_progress row and no undo -- there is nothing here that could ever feed back into
-- due_at/ease_factor/status, so the "never touches SRS" guarantee those files already document
-- stays intact. Same XP shape as a graded review (10 correct / 2 wrong -- see
-- leaderboard_stats_on_review_insert) and, like the reading test before it
-- (20261110_reading_test_counts_toward_streak_and_xp.sql), an answer counts as today's streak
-- day but deliberately leaves reviews_count/new_cards_count alone -- a practice rep is neither a
-- graded SRS review nor a new card, and practice decks reuse every card ever introduced with no
-- daily limit, so folding it into reviews_count would make that metric meaningless.

-- 1. The log table -----------------------------------------------------------------------------

create table public.practice_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  exercise_type text not null,
  kanji_id bigint references public.kanji(id) on delete cascade,
  word_id bigint references public.vocabulary(id) on delete cascade,
  hiragana_id bigint references public.hiragana(id) on delete cascade,
  katakana_id bigint references public.katakana(id) on delete cascade,
  correct boolean not null,
  practiced_at timestamptz not null default now()
);
create index idx_practice_logs_user_practiced on public.practice_logs (user_id, practiced_at);
alter table public.practice_logs enable row level security;

create policy "Users manage own practice_logs" on public.practice_logs
  as permissive for all
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

-- Same reason as review_logs/user_reading_test_progress in 20261112_admin_can_view_student_data.sql
-- -- get_streak_active_days/get_review_activity are plain (non SECURITY DEFINER) functions that
-- rely entirely on RLS, so an admin calling them for a student needs their own read policy here.
create policy "Admins can view practice_logs" on public.practice_logs
  as permissive for select to authenticated using (public.is_admin());

-- 2. Streak: a practice answer is now an activity day, same union get_streak_active_days/
--    get_review_activity already build from review_logs/new-card tables/rule tables/kana
--    drilling/the reading test (latest shape: 20261110_reading_test_counts_toward_streak_and_xp.sql).

create or replace function public.get_streak_active_days(p_user_id uuid, p_timezone text default 'UTC')
returns table (d date)
language sql
stable
as $$
  select distinct public.study_day(a.at, p_timezone) as d from (
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
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select attempted_at from public.user_reading_test_progress where user_id = p_user_id
    union all
    select practiced_at from public.practice_logs where user_id = p_user_id
  ) a;
$$;

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
      public.study_day(now(), p_timezone) - (p_days - 1),
      public.study_day(now(), p_timezone),
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
    union all
    select last_drilled_at from public.user_hiragana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select last_drilled_at from public.user_katakana_progress
      where user_id = p_user_id and last_drilled_at is not null
    union all
    select attempted_at from public.user_reading_test_progress where user_id = p_user_id
    union all
    select practiced_at from public.practice_logs where user_id = p_user_id
  )
  select
    d.day,
    exists (
      select 1 from activity_at a
      where public.study_day(a.at, p_timezone) = d.day
    ) as has_activity
  from days d
  order by d.day asc;
$$;

-- 3. XP: 10 for a correct practice answer, 2 for a wrong one -- exact same shape as
--    leaderboard_stats_on_reading_test, keyed off practice_logs instead of
--    user_reading_test_progress, and likewise leaves reviews_count/new_cards_count untouched.

create or replace function public.leaderboard_stats_on_practice_answer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 10 else 2 end;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.practiced_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, current_streak, longest_streak, last_active_date)
  values (new.user_id, v_xp, 1, 1, v_day)
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points)
  values (new.user_id, v_day, v_xp)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

drop trigger if exists leaderboard_stats_practice_answer_trigger on public.practice_logs;
create trigger leaderboard_stats_practice_answer_trigger
  after insert on public.practice_logs
  for each row execute function public.leaderboard_stats_on_practice_answer();
