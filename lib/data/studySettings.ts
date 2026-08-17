import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { StudySettings } from "@/lib/types";

export async function fetchStudySettings(
  supabase: AppSupabaseClient,
  userId: string
): Promise<StudySettings | null> {
  const { data, error } = await supabase
    .from("user_study_settings")
    .select("*, leaderboard_alias:leaderboard_aliases(adjective, noun)")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}
