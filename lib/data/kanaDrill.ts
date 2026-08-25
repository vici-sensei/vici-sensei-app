import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";

export interface KanaDrillResult {
  drillStreak: number;
  graduated: boolean;
}

interface DrillResultRow {
  drill_streak: number;
  graduated: boolean;
}

/** Records one answer in the post-introduction hiragana/katakana drill (see
 * record_hiragana_drill_result/record_katakana_drill_result -- 20260827_hiragana_katakana_drill.sql).
 * A wrong answer resets that character's own streak to 0; a correct one advances it, graduating
 * the character (status -> 'review', due tomorrow) once it reaches 3 in a row. */
async function recordDrillResult(
  supabase: AppSupabaseClient,
  rpc: "record_hiragana_drill_result" | "record_katakana_drill_result",
  param: "p_hiragana_id" | "p_katakana_id",
  userId: string,
  itemId: number,
  correct: boolean
): Promise<KanaDrillResult> {
  const { data, error } = await supabase
    .rpc(rpc, { p_user_id: userId, [param]: itemId, p_correct: correct })
    .single();

  if (error) throw new ApiError(500, error.message);
  const row = data as DrillResultRow;
  return { drillStreak: row.drill_streak, graduated: row.graduated };
}

export function recordHiraganaDrillResult(
  supabase: AppSupabaseClient,
  userId: string,
  hiraganaId: number,
  correct: boolean
): Promise<KanaDrillResult> {
  return recordDrillResult(supabase, "record_hiragana_drill_result", "p_hiragana_id", userId, hiraganaId, correct);
}

export function recordKatakanaDrillResult(
  supabase: AppSupabaseClient,
  userId: string,
  katakanaId: number,
  correct: boolean
): Promise<KanaDrillResult> {
  return recordDrillResult(supabase, "record_katakana_drill_result", "p_katakana_id", userId, katakanaId, correct);
}
