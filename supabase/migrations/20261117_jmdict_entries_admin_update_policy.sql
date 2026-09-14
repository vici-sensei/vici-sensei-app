-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- First admin WRITE path in the app -- every existing admin page is read-only. Lets an admin
-- resolve the manual leftovers from the vocabulary<->jmdict_entries linking work (see
-- 20261116_jmdict_entries_vocabulary_id.sql) from an in-app review page instead of the one-off
-- Claude Artifact used for the bulk of it. Column-scoped grants (mirroring
-- 20260817_users_admin_flag.sql's users.admin lockdown) plus an is_admin()-gated RLS policy are
-- the enforcement -- this app has no server-side write layer, every mutation goes through the
-- anon-key browser client, so RLS is the only real gate.

revoke update on public.jmdict_entries from authenticated;
grant update (vocabulary_id, match_method) on public.jmdict_entries to authenticated;

create policy "Admins can update jmdict_entries vocabulary_id"
  on public.jmdict_entries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Tracks vocabulary rows an admin explicitly reviewed and confirmed have NO corresponding
-- jmdict_entries row -- distinct from "not yet reviewed". There's nowhere on jmdict_entries
-- itself to record this, since there's no row to attach it to.
alter table public.vocabulary add column jmdict_match_reviewed boolean not null default false;

revoke update on public.vocabulary from authenticated;
grant update (jmdict_match_reviewed) on public.vocabulary to authenticated;

create policy "Admins can update vocabulary jmdict_match_reviewed"
  on public.vocabulary for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
