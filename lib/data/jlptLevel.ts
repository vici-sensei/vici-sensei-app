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

  // Only asked on an actual level-up (rare): how many locked kanji words the new level lets through
  // ("Reading unlock" cards), for the popup. Losing just this line isn't worth losing the popup.
  let unlockedReadings = 0;
  let readingUnlocksPerDay: number | null = null;
  if (row.leveled_up) {
    const [countResult, settingsResult] = await Promise.all([
      supabase.rpc("count_unlockable_readings", { p_user_id: userId }),
      supabase.from("user_study_settings").select("new_reading_unlocks_per_day").eq("user_id", userId).maybeSingle(),
    ]);
    if (!countResult.error) unlockedReadings = (countResult.data as number | null) ?? 0;
    if (!settingsResult.error) readingUnlocksPerDay = settingsResult.data?.new_reading_unlocks_per_day ?? null;
  }

  return {
    leveledUp: row.leveled_up,
    completedLevel: row.completed_level as JlptLevelUpResult["completedLevel"],
    newLevel: row.new_level as JlptLevelUpResult["newLevel"],
    isMaxLevel: row.is_max_level,
    unlockedReadings,
    readingUnlocksPerDay,
  };
}
