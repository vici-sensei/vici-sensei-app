import type { JlptLevel } from "@/lib/srs/constants";
import type { ServerRegion } from "@/lib/serverRegion";

export interface LeaderboardAlias {
  adjective: string;
  noun: string;
}

export type StudyTrack = "kana" | "standard";

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
  study_track: StudyTrack;
  study_hiragana: boolean;
  study_katakana: boolean;
  new_hiragana_per_day: number;
  new_katakana_per_day: number;
  /** The exact step the user was on -- updated on every navigation, so a refresh resumes here. */
  onboarding_step: number;
  /** The furthest step ever reached -- only grows, used for the progress bar (which steps are clickable/dimmed). */
  onboarding_furthest_step: number;
  preferred_server_region: ServerRegion | null;
  /** null until the user explicitly picks one -- see onboarding's leaderboard step. */
  leaderboard_anonymous: boolean | null;
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
  onboarding_step?: number;
  onboarding_furthest_step?: number;
  preferred_server_region?: ServerRegion;
  study_track?: StudyTrack;
  study_hiragana?: boolean;
  study_katakana?: boolean;
  new_hiragana_per_day?: number;
  new_katakana_per_day?: number;
}
