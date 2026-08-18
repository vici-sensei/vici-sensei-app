-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- `onboarding_step` was being written only when advancing to a new furthest
-- step, so a refresh always resumed at the furthest step reached -- even if
-- the user had since navigated back to an earlier one. It's now written on
-- every step change (Next, Back, or a progress-bar jump), so it always
-- reflects exactly where the user was when they refreshed.
--
-- This new column keeps the old "furthest step reached" concept separately,
-- since the progress bar still needs it (steps beyond the current one stay
-- clickable/dimmed once visited, instead of looking unvisited again after
-- navigating back).

alter table public.user_study_settings
  add column onboarding_furthest_step int2 default 0 not null;

alter table public.user_study_settings
  add constraint user_study_settings_onboarding_furthest_step_check
  check (onboarding_furthest_step between 0 and 4);
