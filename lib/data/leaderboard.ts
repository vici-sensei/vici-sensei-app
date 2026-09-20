import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

const RPC_BY_METRIC: Record<LeaderboardMetric, string> = {
  reviews: "get_leaderboard_reviews",
  new_cards: "get_leaderboard_new_cards",
  xp: "get_leaderboard_xp",
  streak: "get_leaderboard_streak",
};

/** When the viewer's current `period` ends: the next study-day boundary (6 a.m. in `timezone`) of the
 * day, week, month or year they are in -- computed by leaderboard_period_end, the same study day the
 * boards themselves score each row on. Null for "all_time", which never resets. */
export async function fetchLeaderboardPeriodEnd(
  supabase: AppSupabaseClient,
  period: LeaderboardPeriod,
  timezone: string
): Promise<string | null> {
  if (period === "all_time") return null;
  const { data, error } = await supabase.rpc("leaderboard_period_end", { p_period: period, p_timezone: timezone });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

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
