-- Phase 6 (admin mirror), part 1 of 3. Applied to the EU project ONLY -- unlike Phase 5's
-- leaderboard migrations, this one is asymmetric by design (Decision 5): the admin account only
-- exists in EU, so only EU needs a copy of US's operational data. US gets nothing from this file.
--
-- mirror_us.<table> is a 1:1 structural copy (LIKE ... INCLUDING DEFAULTS INCLUDING INDEXES --
-- column defs, defaults, and the PK/unique indexes logical replication needs to apply
-- UPDATE/DELETE; LIKE never copies FK constraints, which is what's wanted here: a mirrored
-- review_logs.kanji_id should NOT be constrained against local public.kanji, even though it
-- happens to reference the same shared content by id) of the one table this admin surface reads
-- from the US project. RLS is enabled with zero policies on every one of these as defense in
-- depth -- nothing is granted to anon/authenticated on this schema at all, so the only way in is
-- the SECURITY DEFINER admin_* functions (part 3), each with its own explicit is_admin() check.
-- Content tables (kanji, vocabulary, hiragana, katakana, ...) are NOT mirrored -- Phase 1 already
-- verified they're byte-identical across both projects, so admin_* functions read them straight
-- from public.

CREATE SCHEMA IF NOT EXISTS mirror_us;

DO $$
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
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS mirror_us.%1$I (LIKE public.%1$I INCLUDING DEFAULTS INCLUDING INDEXES)',
      t
    );
    EXECUTE format('ALTER TABLE mirror_us.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA mirror_us FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA mirror_us FROM anon, authenticated;
