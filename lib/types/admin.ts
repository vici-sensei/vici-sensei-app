import type { Region } from "@/lib/supabase/regions";

export interface FreeLessonLead {
  id: number;
  name: string;
  whatsapp: string;
  consent: boolean;
  contacted: boolean;
  created_at: string;
}

export interface StudentRosterRow {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  country: string | null;
  is_premium: boolean;
  created_at: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  reviews_count: number;
  new_cards_count: number;
  learned_count: number;
  practice_count: number;
  test_count: number;
  xp_points: number;
  /** When is_premium stops being true (the premium-trial-expiry cron flips it). null = no end date.
   *  Kept after expiry, so a past value on a non-Pro row means "trial ended". Always null when
   *  NEXT_PUBLIC_MULTI_REGION is off (the old project has no such column). */
  premium_until: string | null;
  /** Pro comes from a Stripe subscription (stripe-webhook owns is_premium), not from an admin. */
  has_stripe: boolean;
  /** Which project the student's row lives in; null when NEXT_PUBLIC_MULTI_REGION is off. */
  region: Region | null;
  study_track: "kana" | "standard" | null;
}

export interface StudentDailyActivity {
  day: string;
  reviews_count: number;
  new_cards_count: number;
  learned_count: number;
  practice_count: number;
  test_count: number;
  xp_points: number;
}

/** The four kinds of "new card" -- one per progress table a leaderboard new-card bump fires on
 *  (see get_student_new_card_progress, 20261245). Same names get_level_progress uses. */
export type NewCardCategory = "kanji" | "vocabulary" | "hiragana_reading" | "katakana_reading";

/** get_student_new_card_progress (20261245_student_new_card_progress_rpc.sql): everything the
 *  "New cards progress" chart needs. Every date is already a study day in `timezone`. */
export interface StudentNewCardProgress {
  timezone: string;
  join_day: string;
  today: string;
  /** Every card ever introduced, including ones later undone/deleted -- so it can exceed the sum of `history`. */
  counter_total: number;
  history: { day: string; category: NewCardCategory; level: string | null; count: number }[];
  pool: { category: NewCardCategory; level: string | null; total: number }[];
  tests: { day: string; test_type: "hiragana" | "katakana"; attempt_number: number; percent: number }[];
}

export interface StudentReviewLogEntry {
  id: number;
  exercise_type: string;
  correct: boolean | null;
  reviewed_at: string;
  kanji: { kanji: string } | null;
  word: { word: string; kana_reading: string | null; usually_kana: boolean | null } | null;
  hiragana: { character: string } | null;
  katakana: { character: string } | null;
}

export interface StudentPracticeLogEntry {
  id: number;
  exercise_type: string;
  correct: boolean;
  practiced_at: string;
  kanji: { kanji: string } | null;
  word: { word: string; kana_reading: string | null; usually_kana: boolean | null } | null;
  hiragana: { character: string } | null;
  katakana: { character: string } | null;
}

export interface StudentTestResult {
  id: number;
  test_type: string;
  attempt_number: number;
  percent: number;
  earned_at: string;
}

/** One item in the per-day drill-down list on the admin student detail page -- reviews, free
 * practice reps, kana drill graduations ("learned"), and reading test attempts merged into a
 * single chronological, type-labeled list (see fetchStudentActivityForDay). */
export type StudentActivityEntry =
  | { kind: "review"; key: string; at: string; label: string; correct: boolean | null }
  | { kind: "practice"; key: string; at: string; label: string; correct: boolean }
  | { kind: "learned"; key: string; at: string; label: string }
  | { kind: "test"; key: string; at: string; label: string; percent: number };

export interface StudentAchievement {
  achievement_key: string;
  earned_at: string;
}

/** Row shape of get_admin_dashboard_stats() (see 20261113_admin_dashboard_stats_rpc.sql). */
export interface AdminDashboardStats {
  total_students: number;
  new_students_7d: number;
  active_today: number;
  active_7d: number;
  reviews_today: number;
  new_leads_7d: number;
  leads_uncontacted: number;
}

export interface StudentDetail {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  country: string | null;
  is_premium: boolean;
  created_at: string;
  pending_deletion_at: string | null;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  retention_rate: number | null;
  study_track: "kana" | "standard" | null;
  enabled_levels: string[];
  new_kanji_per_day: number | null;
  new_vocab_per_day: number | null;
  new_hiragana_per_day: number | null;
  new_katakana_per_day: number | null;
  max_reviews_per_day: number | null;
  /** user_study_settings.extended_romaji_enabled -- null when the student has no settings row. */
  extended_romaji_enabled: boolean | null;
  /** user_study_settings.kana_practice_enabled -- null when the student has no settings row. */
  kana_practice_enabled: boolean | null;
  /** user_study_settings.timezone -- null when the student has no settings row or never set one;
   *  callers needing a study-day boundary should fall back to 'UTC', same as every server-side
   *  study_day/study_day_bounds call does. */
  timezone: string | null;
  /** user_study_settings.timezone_preference_enabled -- true when `timezone` above is the student's own
   *  "Custom timezone" pick rather than the one their browser reported; null when there's no settings row. */
  timezone_preference_enabled: boolean | null;
  /** Which Supabase project this student's own row actually lives in -- 'eu'/'us' from
   *  admin_get_student_detail (multi-region only, see 20260923044546_admin_leads_mirror_and_student_region_eu.sql);
   *  null when NEXT_PUBLIC_MULTI_REGION is off, since there's only one project to be in. */
  region: Region | null;
}
