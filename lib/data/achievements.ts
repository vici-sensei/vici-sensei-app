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
