import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { UserBadge } from "@/lib/types";

export async function fetchUserBadges(supabase: AppSupabaseClient, userId: string): Promise<UserBadge[]> {
  const { data, error } = await supabase
    .from("user_badges")
    .select("id, badge_key, test_type, attempt_number, percent, earned_at, updated_at")
    .eq("user_id", userId)
    .order("earned_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
