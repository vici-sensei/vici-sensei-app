-- Grants the teacher-admin read access to student data for the admin roster/detail pages.
-- Every table below is currently RLS-locked to auth.uid() = user_id (or = id for users) only --
-- confirmed live before writing this. This migration only ever adds SELECT; it never grants
-- write access, and existing student-facing policies are untouched (Postgres OR's multiple
-- permissive policies together, so this is additive, not a replacement).
--
-- error_logs and free_lesson_leads already inline this same admin check directly in their
-- policies (no shared helper existed yet). With ~16 policies needed here, a helper is worth
-- introducing now -- future admin policies should use is_admin() instead of repeating the
-- inline COALESCE. The two already-shipped inline policies are left as-is; no need to touch
-- working migrations just to converge on the helper.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select admin from public.users where id = auth.uid()), false);
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Unlocks the roster (embeds users under leaderboard_stats).
create policy "Admins can view all users" on public.users
  as permissive for select to authenticated using (public.is_admin());

-- Unlocks get_review_activity, get_retention_rate, get_review_streak, get_streak_active_days,
-- and the daily review drill-down, all of which are plain (non security definer) functions that
-- filter by a p_user_id param and rely entirely on RLS for access control.
create policy "Admins can view review_logs" on public.review_logs
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view study_sessions" on public.study_sessions
  as permissive for select to authenticated using (public.is_admin());

-- Unlocks fetchProgressSummary (lib/data/progress.ts) and get_level_progress/get_review_activity
-- for the "what do they know" section.
create policy "Admins can view user_kanji_meaning_progress" on public.user_kanji_meaning_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_kanji_reading_progress" on public.user_kanji_reading_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_vocabulary_progress" on public.user_vocabulary_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_hiragana_progress" on public.user_hiragana_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_katakana_progress" on public.user_katakana_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_hiragana_rule_progress" on public.user_hiragana_rule_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_katakana_rule_progress" on public.user_katakana_rule_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_kanji_basics_progress" on public.user_kanji_basics_progress
  as permissive for select to authenticated using (public.is_admin());

-- Unlocks the "what did they do on tests" section.
create policy "Admins can view user_reading_test_progress" on public.user_reading_test_progress
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view test_status" on public.test_status
  as permissive for select to authenticated using (public.is_admin());

-- Unlocks achievements and study-goal context on the student detail page.
create policy "Admins can view user_achievements" on public.user_achievements
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view user_study_settings" on public.user_study_settings
  as permissive for select to authenticated using (public.is_admin());

-- Unlocks the roster's streak/last-active/reviews columns and the daily activity table --
-- these two tables had zero policies at all (only readable by SECURITY DEFINER functions), so
-- this is the first direct client access to them, admin-only.
create policy "Admins can view leaderboard_stats" on public.leaderboard_stats
  as permissive for select to authenticated using (public.is_admin());
create policy "Admins can view leaderboard_daily_stats" on public.leaderboard_daily_stats
  as permissive for select to authenticated using (public.is_admin());
