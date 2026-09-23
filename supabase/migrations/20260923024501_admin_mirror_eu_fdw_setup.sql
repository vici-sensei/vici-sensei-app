-- Admin panel on US, part 2 of 2. US only. postgres_fdw mirror of EU into mirror_eu.<table> --
-- same mechanism as EU's fix for mirror_us (20260923003744_fix_mirror_us_replication.sql), applied
-- symmetrically for the reverse direction. Native logical replication was never used here at all
-- (unlike the original, broken mirror_us_sub) -- this project goes straight to the working
-- approach.
--
-- This file has the non-secret parts only (extension, server shell, staging schema, refresh
-- function, cron job). CREATE USER MAPPING (needs the EU DB password) and IMPORT FOREIGN SCHEMA
-- are run directly, not committed -- same pattern as every other cross-project connection string
-- in this project.

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS eu_mirror_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'db.zrgcullndfhouencqqqc.supabase.co', port '5432', dbname 'postgres');

CREATE SCHEMA IF NOT EXISTS mirror_eu_fdw;
REVOKE ALL ON SCHEMA mirror_eu_fdw FROM anon, authenticated;

CREATE OR REPLACE FUNCTION mirror_eu.refresh_all() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'leaderboard_stats', 'leaderboard_daily_stats', 'user_study_settings',
    'review_logs', 'practice_logs', 'user_hiragana_progress', 'user_katakana_progress',
    'test_status', 'user_achievements', 'user_kanji_meaning_progress',
    'user_kanji_reading_progress', 'user_vocabulary_progress', 'user_hiragana_rule_progress',
    'user_katakana_rule_progress', 'user_reading_test_progress'
  ]
  LOOP
    EXECUTE format('TRUNCATE mirror_eu.%I', t);
    EXECUTE format('INSERT INTO mirror_eu.%1$I SELECT * FROM mirror_eu_fdw.%1$I', t);
  END LOOP;
END;
$$;

SELECT cron.schedule('mirror-eu-refresh', '*/5 * * * *', $$SELECT mirror_eu.refresh_all()$$);
