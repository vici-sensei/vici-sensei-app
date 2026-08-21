-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Onboarding gains a new step (StepKana, "Do you already know hiragana and
-- katakana?"), inserted before StepLevel -- onboarding_step/onboarding_furthest_step
-- grow from 5 possible positions (0-4) to 6 (0-5).

alter table public.user_study_settings
  drop constraint user_study_settings_onboarding_step_check,
  drop constraint user_study_settings_onboarding_furthest_step_check;

alter table public.user_study_settings
  add constraint user_study_settings_onboarding_step_check
  check (onboarding_step >= 0 and onboarding_step <= 5),
  add constraint user_study_settings_onboarding_furthest_step_check
  check (onboarding_furthest_step >= 0 and onboarding_furthest_step <= 5);
