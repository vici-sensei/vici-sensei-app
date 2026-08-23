-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Raises the default max_reviews_per_day for new users 200 -> 50, and adds a
-- structural floor of 1 so the review cap can never be set to 0 (which would
-- silently starve a user's queue of all due cards) or negative. Same precedent
-- as 20260823_kana_daily_cap_step_of_five.sql: the Settings page stepper
-- (StudySettingsForm's adjustReviews) already can't produce a value below
-- REVIEWS_STEP (10) through the UI, but nothing stopped a direct write (RPC,
-- SQL editor, forged client payload) from landing 0 or lower.
--
-- Normalizes any existing rows at or below 0 to the new default before the
-- CHECK is added, since ADD CONSTRAINT validates existing data by default.

update public.user_study_settings
set max_reviews_per_day = 50
where max_reviews_per_day <= 0;

alter table public.user_study_settings
  alter column max_reviews_per_day set default 50;

alter table public.user_study_settings
  add constraint user_study_settings_max_reviews_per_day_check
  check (max_reviews_per_day > 0);
