-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- /onboarding is now a 5-step wizard (level, country, region, profile,
-- leaderboard). This tracks the furthest step the user has reached, so a
-- refresh mid-onboarding resumes there instead of restarting from step 1.

alter table public.user_study_settings
  add column onboarding_step int2 default 0 not null;

alter table public.user_study_settings
  add constraint user_study_settings_onboarding_step_check check (onboarding_step between 0 and 4);
