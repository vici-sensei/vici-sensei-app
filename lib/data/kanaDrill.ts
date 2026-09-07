import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";

export interface KanaDrillResult {
  drillStreak: number;
  graduated: boolean;
  newlyUnlockedAchievements: string[];
}

interface DrillResultRow {
  drill_streak: number;
  graduated: boolean;
  newly_unlocked_achievements: string[] | null;
}

/** Records one answer in the post-introduction hiragana/katakana drill (see
 * record_hiragana_drill_result/record_katakana_drill_result -- 20260827_hiragana_katakana_drill.sql,
 * 20261007_kana_drill_due_at_study_day.sql). A wrong answer resets that character's own streak to
 * 0; a correct one advances it, graduating the character (status -> 'review') once it reaches 3 in
 * a row -- due at the start of the next study day (timezone, 6AM-local rollover), not an exact +24h. */
async function recordDrillResult(
  supabase: AppSupabaseClient,
  rpc: "record_hiragana_drill_result" | "record_katakana_drill_result",
  param: "p_hiragana_id" | "p_katakana_id",
  userId: string,
  itemId: number,
  correct: boolean,
  timezone: string
): Promise<KanaDrillResult> {
  const { data, error } = await supabase
    .rpc(rpc, { p_user_id: userId, [param]: itemId, p_correct: correct, p_timezone: timezone })
    .single();

  if (error) throw new ApiError(500, error.message);
  const row = data as DrillResultRow;
  return { drillStreak: row.drill_streak, graduated: row.graduated, newlyUnlockedAchievements: row.newly_unlocked_achievements ?? [] };
}

export function recordHiraganaDrillResult(
  supabase: AppSupabaseClient,
  userId: string,
  hiraganaId: number,
  correct: boolean,
  timezone: string
): Promise<KanaDrillResult> {
  return recordDrillResult(supabase, "record_hiragana_drill_result", "p_hiragana_id", userId, hiraganaId, correct, timezone);
}

export function recordKatakanaDrillResult(
  supabase: AppSupabaseClient,
  userId: string,
  katakanaId: number,
  correct: boolean,
  timezone: string
): Promise<KanaDrillResult> {
  return recordDrillResult(supabase, "record_katakana_drill_result", "p_katakana_id", userId, katakanaId, correct, timezone);
}
