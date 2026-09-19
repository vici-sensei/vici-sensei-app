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
}
