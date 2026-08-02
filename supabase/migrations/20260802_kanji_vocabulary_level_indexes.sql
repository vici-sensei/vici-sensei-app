-- Run this manually in the Supabase SQL editor.
--
-- public.vocabulary.jlpt_level and public.kanji.level have no index, but
-- both are filtered on every study-queue load and every search:
-- search_vocabulary, get_new_vocab_candidates, search_kanji,
-- get_new_kanji_candidates, and get_due_cards (via a join on kanji.level).
-- Without an index, each of those does a sequential scan over the full
-- table. CONCURRENTLY avoids locking the tables for writes while building.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocabulary_jlpt_level
  ON public.vocabulary USING btree (jlpt_level);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kanji_level
  ON public.kanji USING btree ("level");
