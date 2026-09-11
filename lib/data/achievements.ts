import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { UserAchievement } from "@/lib/types";

export async function fetchUserAchievements(supabase: AppSupabaseClient, userId: string): Promise<UserAchievement[]> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("id, achievement_key, earned_at, acknowledged_at")
    .eq("user_id", userId)
    .order("earned_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Achievement keys earned but not yet shown in the unlock-celebration modal (acknowledged_at is
 * null) -- the durable replacement for the old sessionStorage queue (lib/study/newAchievements.ts,
 * removed by 20261017_acknowledge_achievements.sql): a tab/browser closed mid-session no longer
 * loses the notification, since it's read fresh from here the next time the student reaches a
 * summary page, on any device. Pair with acknowledgeAchievements once the modal has actually been
 * shown. */
export async function fetchUnacknowledgedAchievements(supabase: AppSupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("achievement_key")
    .eq("user_id", userId)
    .is("acknowledged_at", null)
    .order("earned_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.achievement_key);
}

/** Marks the given achievement keys as seen, via the acknowledge_achievements RPC (security
 * definer, scoped to auth.uid() -- see 20261017_acknowledge_achievements.sql) so they aren't shown
 * again on a later summary visit. Call only with keys that were actually just displayed to the
 * student, not "everything currently unacknowledged" -- an achievement earned in the gap between
 * fetching and acknowledging (a second tab, a background sync) must stay unacknowledged so it
 * still gets its own popup later. */
export async function acknowledgeAchievements(supabase: AppSupabaseClient, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { error } = await supabase.rpc("acknowledge_achievements", { p_keys: keys });
  if (error) throw new Error(error.message);
}
