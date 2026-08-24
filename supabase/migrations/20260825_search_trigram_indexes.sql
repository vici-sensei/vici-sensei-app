-- Run each CREATE INDEX statement below manually and separately in the Supabase SQL editor (or
-- DBeaver) -- CONCURRENTLY cannot run inside a multi-statement transaction block. The CREATE
-- EXTENSION statement is safe to run on its own beforehand.
--
-- search_kanji()/search_vocabulary() match on substring/prefix ILIKE ('%query%') against
-- kanji.kanji and vocabulary.word/kana_reading/romaji_reading. No plain btree index can serve a
-- leading-wildcard ILIKE, so these always sequential-scan today. Fine at 2k/17k rows now; these
-- trigram GIN indexes let the planner use an index instead once either table grows, with no
-- change needed to the RPCs themselves (ILIKE already picks up a matching trgm index for free).
-- Not extended to the meanings/kun_readings/on_readings arrays -- those are matched per-element
-- via unnest()+ILIKE, which trigram indexes on a text[] column can't accelerate the same way,
-- and they're already the lowest-priority match tiers (rank 4-5) in both functions.

create extension if not exists pg_trgm with schema extensions;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kanji_kanji_trgm ON public.kanji USING gin (kanji extensions.gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocabulary_word_trgm ON public.vocabulary USING gin (word extensions.gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocabulary_kana_reading_trgm ON public.vocabulary USING gin (kana_reading extensions.gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocabulary_romaji_reading_trgm ON public.vocabulary USING gin (romaji_reading extensions.gin_trgm_ops);
