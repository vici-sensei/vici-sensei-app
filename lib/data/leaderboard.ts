import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

const RPC_BY_METRIC: Record<LeaderboardMetric, string> = {
  reviews: "get_leaderboard_reviews",
  new_cards: "get_leaderboard_new_cards",
  xp: "get_leaderboard_xp",
  streak: "get_leaderboard_streak",
};

export async function fetchLeaderboard(
  supabase: AppSupabaseClient,
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
  viewerId: string,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const params = metric === "streak" ? { p_limit: limit, p_viewer_id: viewerId } : { p_period: period, p_limit: limit, p_viewer_id: viewerId };

  const { data, error } = await supabase.rpc(RPC_BY_METRIC[metric], params);
  if (error) throw new Error(error.message);
  return data ?? [];
}
