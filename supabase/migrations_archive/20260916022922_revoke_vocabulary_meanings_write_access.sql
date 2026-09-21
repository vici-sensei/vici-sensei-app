-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- public.vocabulary.primary_meanings/other_meanings are now considered finalized -- populated by
-- the one-off backfills in 20261130 through 20261204, with no live app code or trigger writing to
-- them anymore (the only writer, the now-retired /admin/jmdict-senses page's app-level sync in
-- lib/data/jmdictSenses.ts, was deleted in 20261205_retire_jmdict_senses_admin_page.sql). Revokes
-- the column-scoped write grant added for that page in
-- 20261130_vocabulary_primary_other_meanings.sql so `authenticated` can no longer write these two
-- columns through the browser client -- matches how 20261205 already revoked the equivalent grant
-- on jmdict_entries.senses. jmdict_match_reviewed/jmdict_match_reviewed_at keep their own grants;
-- that review workflow is unrelated and still active.

revoke update (primary_meanings, other_meanings) on public.vocabulary from authenticated;
