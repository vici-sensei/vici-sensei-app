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
  /** Kana-track only -- shows a "Practice" button on the dashboard once the user is done for the
   * day, linking to /study/practice (an unscored, single-pass review of every hiragana/katakana
   * character they've seen). Purely a display preference; ignored on the standard track. */
  kana_practice_enabled: boolean;
  /** When true, hiragana/katakana reading cards accept hiragana.extended_romaji /
   * katakana.extended_romaji as correct answers on top of romaji; when false (default) only
   * romaji counts. Applies on both tracks -- see ReviewCardKanaReading. */
  extended_romaji_enabled: boolean;
  /** "Custom timezone" toggle -- when true the study day, daily limits, streak and leaderboards
   * follow `preferred_timezone` instead of the timezone the browser reports (see lib/timezone.ts). */
  timezone_preference_enabled: boolean;
  /** IANA name picked in Settings -> Study. Kept while the toggle is off so turning it back on
   * restores the pick; only takes effect while `timezone_preference_enabled` is true. */
  preferred_timezone: string | null;
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
  /** null is only valid here for the onboarding kana step's "Yes" branch -- clears a stale pick
   * back to "not chosen yet" instead of leaving whatever level a previous answer left behind. */
  enabled_levels?: JlptLevel[] | null;
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
  kana_practice_enabled?: boolean;
  extended_romaji_enabled?: boolean;
  timezone_preference_enabled?: boolean;
  preferred_timezone?: string | null;
}
