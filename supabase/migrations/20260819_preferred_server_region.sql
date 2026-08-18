-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- /onboarding's server region step (America/Europe) has no real
-- multi-region infrastructure behind it yet, but the choice is saved so a
-- refresh mid-onboarding resumes with the same pick instead of falling back
-- to the timezone guess again.

alter table public.user_study_settings
  add column preferred_server_region text null;

alter table public.user_study_settings
  add constraint user_study_settings_preferred_server_region_check
  check (preferred_server_region is null or preferred_server_region = any (array['America', 'Europe']));
