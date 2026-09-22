-- The EU/US restore (Phase 0-1 of the multi-region migration) carried over table-level grants on
-- public.users but dropped the column-level UPDATE grants that let a signed-in user edit their own
-- profile fields (everything else on the row -- XP, streak, plan, etc. -- stays server-controlled).
-- Confirmed missing on both new projects while testing Phase 7's live OAuth flow: onboarding's
-- profile-save step returned 403 "permission denied for table users". The live project
-- (hmbemylaqnkiamvhcdcd) has exactly these four grants; this mirrors them.
grant update (display_name, avatar_url, country, show_country_on_leaderboard) on public.users to authenticated;
