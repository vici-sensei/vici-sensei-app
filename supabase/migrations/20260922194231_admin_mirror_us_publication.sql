-- Phase 6, US side. Publishes the 16 tables mirror_us subscribes to (see the 3 EU-side
-- 20260922203*.sql files). Applied to vici-sensei-app-us ONLY.
CREATE PUBLICATION mirror_us_pub FOR TABLE
  public.users, public.leaderboard_stats, public.leaderboard_daily_stats,
  public.user_study_settings, public.review_logs, public.practice_logs,
  public.user_hiragana_progress, public.user_katakana_progress, public.test_status,
  public.user_achievements, public.user_kanji_meaning_progress,
  public.user_kanji_reading_progress, public.user_vocabulary_progress,
  public.user_hiragana_rule_progress, public.user_katakana_rule_progress,
  public.user_reading_test_progress;
