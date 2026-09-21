-- Run this manually in the Supabase SQL editor.
--
-- Supabase's performance advisor flags "Auth RLS Initialization Plan" on
-- these tables: writing `auth.uid() = user_id` directly in a policy makes
-- Postgres re-evaluate auth.uid() (a function call) for every row scanned,
-- instead of once per query. Wrapping it as `(select auth.uid())` lets the
-- planner treat it as an InitPlan -- evaluated once and reused. Behavior is
-- identical, only the query plan changes. See:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

alter policy "Users manage own review_logs" on public.review_logs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own study_sessions" on public.study_sessions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own user_kanji_meaning_progress" on public.user_kanji_meaning_progress
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own user_kanji_reading_progress" on public.user_kanji_reading_progress
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own user_study_settings" on public.user_study_settings
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own user_vocabulary_progress" on public.user_vocabulary_progress
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Allow individual updates to own profile" on public.users
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "Users can view their own profile." on public.users
  using ((select auth.uid()) = id);
