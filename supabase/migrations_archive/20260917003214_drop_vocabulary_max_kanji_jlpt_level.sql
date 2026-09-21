-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Drops public.vocabulary.maximum_jlpt_level_of_individual_kanji at the user's request, confirmed
-- dead by a live-data check: no app code, RPC function, or view reads it (grepped the whole repo
-- and pg_proc/pg_views on the live database). Its only other mention is a comment in
-- 20261114_jmdict_entries_table.sql noting the mirrored (always-NULL) column on jmdict_entries,
-- which is untouched by this migration.
--
-- Not a curated/irreplaceable value: it's the hardest (lowest-N) JLPT level among a word's
-- component kanji, fully derivable from ids_kanji + kanji.level -- verified live against several
-- rows (e.g. id 8142 "振込": kanji levels N1/N3, column value N1). Population was partial anyway
-- (7482/17349 rows set; of the 9867 NULL rows, only 3122 are kanji-less words, so ~6745 rows with
-- kanji were simply never backfilled).
--
-- Dropping the column also drops its dependent vocabulary_max_jlpt_level_check constraint
-- (restricting values to N5-N1); no index references this column.

alter table public.vocabulary
  drop column maximum_jlpt_level_of_individual_kanji;
