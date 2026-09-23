-- Phase 6 fix, 2026-09-23. EU only. Replaces mirror_us_sub (see 20260922194231/203458/203511/203531)
-- -- native Postgres logical replication matches a subscriber's target table by the PUBLISHED
-- schema-qualified name, with no remapping option, so mirror_us_sub was actually writing into EU's
-- live public.<table>, not mirror_us.<table>. Confirmed 2026-09-23 via pg_subscription_rel, after
-- the first real US signup landed as a real row in EU's public.users/leaderboard_stats/
-- user_study_settings. Full writeup: docs/MULTI_REGION_ARCHITECTURE.md, supabase/MIGRATION_PARITY.md.
--
-- Fix: postgres_fdw foreign tables (mirror_us_fdw.<table>, reading live from the US project) plus
-- a pg_cron refresh into mirror_us.<table> -- same 5-minute cadence as Phase 5's lb_export. FDW has
-- no schema-name constraint (local/foreign names are independent), unlike logical replication.
--
-- This file has the non-secret parts only (extension, server shell, staging schema, refresh
-- function, cron job). CREATE USER MAPPING (needs the US DB password) and IMPORT FOREIGN SCHEMA
-- (needs a working connection through that mapping) are run directly, not committed -- same
-- pattern as every other cross-project connection string in this project.

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS us_mirror_server
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'db.wftwdbiqnlqsvgpeypmb.supabase.co', port '5432', dbname 'postgres');

CREATE SCHEMA IF NOT EXISTS mirror_us_fdw;
REVOKE ALL ON SCHEMA mirror_us_fdw FROM anon, authenticated;

-- Single plpgsql function body = one transaction -- mirror_us.* never shows a partially-refreshed
-- state mid-run; either every table updates together or none do (a mid-run error rolls all back).
CREATE OR REPLACE FUNCTION mirror_us.refresh_all() RETURNS void
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
    EXECUTE format('TRUNCATE mirror_us.%I', t);
    EXECUTE format('INSERT INTO mirror_us.%1$I SELECT * FROM mirror_us_fdw.%1$I', t);
  END LOOP;
END;
$$;

SELECT cron.schedule('mirror-us-refresh', '*/5 * * * *', $$SELECT mirror_us.refresh_all()$$);
