-- Phase 6, part 2 of 3. EU only. One UNION ALL view per mirrored table -- every admin_* function
-- (part 3) reads through these instead of public.<table> directly, so none of them need to branch
-- on "is this student local or mirrored": a given user_id only ever has rows on one side, so the
-- union just finds them wherever they are. Same "no grants to anon/authenticated" posture as
-- mirror_us itself -- only reachable through the SECURITY DEFINER admin_* functions.

CREATE SCHEMA IF NOT EXISTS admin_all;

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
      'CREATE OR REPLACE VIEW admin_all.%1$I AS SELECT * FROM public.%1$I UNION ALL SELECT * FROM mirror_us.%1$I',
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA admin_all FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA admin_all FROM anon, authenticated;
