-- `frequency` (text tier: high/normal/low/lowest) is now redundant --
-- rebuild_kanji_detail_words() reads frequency_number instead (see
-- 20261010_kanji_detail_words_use_frequency_number.sql) and search_vocabulary
-- no longer returns it (see 20261011_search_vocabulary_drop_frequency_column.sql).
-- Nothing else in the schema or app code references it.
--
-- Run this AFTER those two migrations -- both still referenced this column
-- until they were updated.

ALTER TABLE public.vocabulary DROP COLUMN frequency;
