-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Drops trg_sync_jmdict_entries_primary_other_meanings and its function, at the user's explicit
-- request despite the tradeoff called out when asked: jmdict_entries.primary_meanings/
-- other_meanings will no longer auto-recompute from senses on insert/update. In particular,
-- scripts/import-jmdict.mjs's --mode=update-senses pass (used for future JMdict version bumps)
-- will leave primary_meanings/other_meanings untouched for any row it updates -- re-running that
-- script, or hand-editing senses again, needs a manual `update jmdict_entries set primary_meanings
-- = ..., other_meanings = ...` (or reintroducing this trigger) to keep them in sync from then on.
-- public.vocabulary.primary_meanings/other_meanings are unaffected either way -- they were already
-- finalized and disconnected from live writes as of 20261206_revoke_vocabulary_meanings_write_access.sql.

drop trigger trg_sync_jmdict_entries_primary_other_meanings on public.jmdict_entries;
drop function public.sync_jmdict_entries_primary_other_meanings();
