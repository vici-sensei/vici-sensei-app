import type { JlptLevel } from "@/lib/srs/constants";

export interface StudySettings {
  user_id: string;
  new_kanji_per_day: number;
  max_reviews_per_day: number;
  enabled_levels: JlptLevel[];
  include_lower_levels: boolean;
  study_kanji: boolean;
  study_vocabulary: boolean;
  updated_at: string;
  new_vocab_per_day: number;
  onboarding_completed: boolean;
  leaderboard_opt_out: boolean;
}

export interface StudySettingsPatch {
  new_kanji_per_day?: number;
  new_vocab_per_day?: number;
  max_reviews_per_day?: number;
  enabled_levels?: JlptLevel[];
  include_lower_levels?: boolean;
  study_kanji?: boolean;
  study_vocabulary?: boolean;
  leaderboard_opt_out?: boolean;
}
