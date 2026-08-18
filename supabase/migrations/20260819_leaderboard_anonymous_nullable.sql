-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- `leaderboard_anonymous` was NOT NULL DEFAULT false, so "never chosen yet"
-- (onboarding Step 5) was indistinguishable from an explicit "with my
-- profile" pick -- resuming onboarding on a different device/browser mid-flow
-- (no localStorage cache there) would silently read as false.
--
-- Made nullable, with no default, so new signups start at NULL ("not chosen
-- yet") instead of false. Existing rows are left as-is (false) -- those
-- accounts have already finished onboarding, so false there already means
-- what it says. The get_leaderboard_*() functions and the
-- assign_leaderboard_alias trigger already treat NULL the same as false
-- (coalesce(leaderboard_anonymous, false) / `if new.leaderboard_anonymous`),
-- so no other functions need to change.

alter table public.user_study_settings
  alter column leaderboard_anonymous drop not null,
  alter column leaderboard_anonymous drop default;
