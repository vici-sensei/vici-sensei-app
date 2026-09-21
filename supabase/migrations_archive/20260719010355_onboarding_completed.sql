-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- New users get a user_study_settings row automatically (see
-- 20260718_signup_study_settings_defaults.sql), so existence of the row can
-- no longer be used as a signal that the user picked their JLPT level.
-- This column tracks that explicitly: false until POST
-- /api/onboarding/complete runs, true afterwards.

alter table public.user_study_settings
  add column onboarding_completed bool default false not null;
