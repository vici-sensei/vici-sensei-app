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
