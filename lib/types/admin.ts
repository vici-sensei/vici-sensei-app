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
  xp_points: number;
}

export interface StudentDailyActivity {
  day: string;
  reviews_count: number;
  new_cards_count: number;
  xp_points: number;
}

export interface StudentReviewLogEntry {
  id: number;
  exercise_type: string;
  correct: boolean | null;
  reviewed_at: string;
  kanji: { kanji: string } | null;
  word: { word: string; kana_reading: string | null } | null;
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

/** One candidate on a get_unresolved_vocabulary_matches() row (see
 * 20261118_get_unresolved_vocabulary_matches_rpc.sql). already_linked_to_vocab_id is set when a
 * DIFFERENT vocabulary row already claimed this jmdict_entries row -- picking it here would
 * silently steal that link, so the UI disables it instead. */
export interface JmdictCandidate {
  jrow_id: number;
  jmdict_id: string;
  word: string | null;
  kana_reading: string;
  meanings: string[];
  parts_of_speech: string[];
  is_common_jisho: boolean;
  already_linked_to_vocab_id: number | null;
}

/** How a vocabulary row's jmdict_entries match was resolved on the review page -- null while
 * still unresolved. 'match' names which candidate (by jrow_id) it was linked to; 'no_match'
 * means an admin confirmed no corresponding jmdict_entries row exists. See
 * resolveJmdictMatch/confirmNoMatch (lib/client-data/jmdictReview.ts). */
export type JmdictResolution = { type: "match"; jrow_id: number } | { type: "no_match" };

/** One row from get_vocabulary_match_review_queue(): a vocabulary word plus its live-computed
 * candidates -- either still unresolved, or resolved within the last 7 days (kept around so the
 * review page can offer an Undo instead of the row just vanishing the instant it's resolved; see
 * 20261120_jmdict_review_queue_includes_resolved.sql). */
export interface VocabularyMatchReviewRow {
  vocab_id: number;
  vocab_word: string | null;
  vocab_kana: string;
  vocab_meanings: string[];
  vocab_parts_of_speech: string[];
  vocab_is_common_jisho: boolean;
  vocab_jlpt_level: string | null;
  candidates: JmdictCandidate[];
  resolution: JmdictResolution | null;
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
}
