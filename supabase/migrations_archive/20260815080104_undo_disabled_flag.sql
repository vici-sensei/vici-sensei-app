-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Some users were using "Undo" to peek at the correct answer (via Check) and
-- retry, or to undo a bad rating and re-answer risk-free, instead of actually
-- learning. This adds a manual, admin-only flag: set it by hand for a
-- specific user (no UI for it -- update the row directly) and their Undo
-- button disappears from /study entirely.
--
-- Deliberately left out of the authenticated UPDATE grant from
-- 20260730_restrict_users_column_grants.sql, so a flagged user can never
-- flip this back off for themselves via a direct PostgREST call -- only
-- service_role (or a human with DB access) can set it.

alter table public.users
  add column undo_disabled boolean not null default false;
