import type { JlptLevel } from "@/lib/srs/constants";

export interface LeaderboardAlias {
  adjective: string;
  noun: string;
}

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
  leaderboard_anonymous: boolean;
  leaderboard_alias_id: number | null;
  leaderboard_alias: LeaderboardAlias | null;
}

export interface StudySettingsPatch {
  new_kanji_per_day?: number;
  new_vocab_per_day?: number;
  max_reviews_per_day?: number;
  enabled_levels?: JlptLevel[];
  include_lower_levels?: boolean;
  study_kanji?: boolean;
  study_vocabulary?: boolean;
  leaderboard_anonymous?: boolean;
}
