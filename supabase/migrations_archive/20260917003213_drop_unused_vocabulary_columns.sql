-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Drops three public.vocabulary columns confirmed dead by a live-data check at the user's request:
--
-- meanings (text[]) -- superseded by primary_meanings/other_meanings; no RPC or app code has read
-- it since 20261208_vocabulary_functions_use_primary_meanings.sql switched every reader over (see
-- that file's own comment: "meanings itself is untouched and not dropped -- just no longer read
-- anywhere"). 17349/17349 rows were populated live. Dropping it also drops its dependent
-- idx_vocabulary_meanings_trgm GIN trigram index (20260825_search_trigram_indexes.sql -- already
-- dead weight, maintained on every write for a column nothing searches) and the
-- vocabulary_meanings_not_empty_check constraint (20260817_require_nonempty_vocabulary_meanings.sql).
--
-- frequency_number_estimated (integer) -- one-off seed value fully consumed by the backfill in
-- 20261009_backfill_vocabulary_frequency_number.sql (copied into frequency_number, which is
-- untouched here and remains the actively-used sort column). Only 845/17349 rows were ever
-- populated; nothing has read it since that backfill ran.
--
-- jmdict_match_reviewed (boolean) / jmdict_match_reviewed_at (timestamptz) -- admin flags from the
-- retired /admin/jmdict-review page (see commit fe88562, "Retire JMdict manual-review workflow,
-- allow shared vocabulary_ids"). The RPC that read them, get_unresolved_vocabulary_matches, no
-- longer exists in the database. Live check: 0 rows ever had jmdict_match_reviewed = true or
-- jmdict_match_reviewed_at set.

alter table public.vocabulary
  drop column meanings,
  drop column frequency_number_estimated,
  drop column jmdict_match_reviewed,
  drop column jmdict_match_reviewed_at;
