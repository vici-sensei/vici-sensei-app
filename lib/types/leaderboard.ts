export type LeaderboardMetric = "reviews" | "new_cards" | "streak" | "xp";
export type LeaderboardPeriod = "daily" | "weekly" | "monthly" | "yearly" | "all_time";

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  country: string | null;
  is_premium: boolean;
  score: number;
  rank: number;
}
