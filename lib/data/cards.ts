import type { AppSupabaseClient } from "@/lib/supabase/types";
import { CARD_TYPE_TO_EXERCISE_TYPE, PROGRESS_TABLES, type CardType } from "@/lib/srs/progressTables";
import { DEFAULT_EASE_FACTOR } from "@/lib/srs/constants";
import { ApiError } from "@/lib/api/client";

export async function resetCard(supabase: AppSupabaseClient, userId: string, type: CardType, id: number): Promise<void> {
  const { table, key } = PROGRESS_TABLES[CARD_TYPE_TO_EXERCISE_TYPE[type]];
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(table)
    .update({
      status: "new",
      ease_factor: DEFAULT_EASE_FACTOR,
      interval_days: 0,
      repetitions: 0,
      lapses: 0,
      learning_step: 0,
      due_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .eq(key, id)
    .select("id")
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "No progress found for this card.");
}

export async function suspendCard(supabase: AppSupabaseClient, userId: string, type: CardType, id: number): Promise<void> {
  const { table, key } = PROGRESS_TABLES[CARD_TYPE_TO_EXERCISE_TYPE[type]];

  const { data, error } = await supabase
    .from(table)
    .update({ status: "suspended", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq(key, id)
    .select("id")
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "No progress found for this card.");
}
