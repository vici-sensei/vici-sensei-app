import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { UserAchievement } from "@/lib/types";

export async function fetchUserAchievements(supabase: AppSupabaseClient, userId: string): Promise<UserAchievement[]> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("id, achievement_key, earned_at")
    .eq("user_id", userId)
    .order("earned_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Which of `keys` were earned at or after `since` (ISO timestamp) -- used to detect a fresh
 * unlock without threading a return value through a fire-and-forget submit (see the reading-test
 * flow in the study test pages, whose last answer isn't reliably awaited before navigating away). */
export async function fetchAchievementsEarnedSince(
  supabase: AppSupabaseClient,
  userId: string,
  keys: string[],
  since: string
): Promise<string[]> {
  if (keys.length === 0) return [];
  const { data, error } = await supabase
    .from("user_achievements")
    .select("achievement_key")
    .eq("user_id", userId)
    .in("achievement_key", keys)
    .gte("earned_at", since);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.achievement_key);
}
