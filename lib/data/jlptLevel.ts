import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JlptLevelUpResult } from "@/lib/types";
import { ApiError } from "@/lib/api/client";

/** check_and_advance_jlpt_level (20260908_auto_advance_jlpt_level.sql) -- read-only unless it
 * finds the user's current level fully learned, in which case it also advances enabled_levels
 * server-side in the same call. Safe to call after any kanji_meaning/kanji_reading/vocab_meaning
 * review; a no-op (leveledUp: false) otherwise. */
export async function checkJlptLevelUp(supabase: AppSupabaseClient, userId: string): Promise<JlptLevelUpResult> {
  const { data, error } = await supabase.rpc("check_and_advance_jlpt_level", { p_user_id: userId });
  if (error) throw new ApiError(500, error.message);

  const row = (
    data as { leveled_up: boolean; completed_level: string | null; new_level: string | null; is_max_level: boolean }[]
  )[0];
  return {
    leveledUp: row.leveled_up,
    completedLevel: row.completed_level as JlptLevelUpResult["completedLevel"],
    newLevel: row.new_level as JlptLevelUpResult["newLevel"],
    isMaxLevel: row.is_max_level,
  };
}
