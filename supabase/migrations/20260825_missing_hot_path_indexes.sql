-- Run each statement below manually and separately in the Supabase SQL editor (or DBeaver) --
-- CONCURRENTLY cannot run inside a multi-statement transaction block, so paste one
-- CREATE INDEX at a time rather than running this whole file in one go.
--
-- get_due_cards() (see 20260820_get_due_cards_drop_as_of.sql) computes all_word_readings,
-- all_word_meanings, and known_kanji_chars for every kanji_reading/vocab_meaning row via a
-- correlated subquery filtering vocabulary by `word` -- with no index on that column, this is
-- a full sequential scan of the entire vocabulary table (thousands of rows) per due card, on
-- every /study load and every 45s queue poll. One index fixes every one of those subqueries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vocabulary_word ON public.vocabulary USING btree (word);

-- get_today_activity_counts() (see 20260822_kana_today_activity_counts.sql) counts new
-- cards introduced today per table via `user_id = ... and created_at >= ... and created_at <
-- ...`. The existing idx_*_created_at indexes have no user_id column, so this can only use the
-- (user_id, due_at) index's leading column and filter created_at row-by-row. This function runs
-- on every /study load, every StudyStatsProvider poll (10-30s), and the dashboard -- composite
-- indexes let it seek straight to the user's rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ukmp_user_created ON public.user_kanji_meaning_progress USING btree (user_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uvp_user_created ON public.user_vocabulary_progress USING btree (user_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_uhp_user_created ON public.user_hiragana_progress USING btree (user_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ukp_user_created ON public.user_katakana_progress USING btree (user_id, created_at);
