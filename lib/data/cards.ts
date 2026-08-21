import type { AppSupabaseClient } from "@/lib/supabase/types";
import { CARD_TYPE_TO_EXERCISE_TYPE, PROGRESS_TABLES, type CardType } from "@/lib/srs/progressTables";
import { ApiError } from "@/lib/api/client";

export async function resetCard(supabase: AppSupabaseClient, userId: string, type: CardType, id: number): Promise<void> {
  const { table, key } = PROGRESS_TABLES[CARD_TYPE_TO_EXERCISE_TYPE[type]];

  // Reset means "forget this card ever happened", not "restart it in learning" -- so it
  // deletes the progress row rather than rewriting it. That puts kanji_meaning/vocab_meaning
  // cards back in get_new_*_candidates' pool (which only excludes kanji/words that already
  // have a progress row), so they re-enter the normal introduce flow and correctly count
  // against today's new-card limit again, instead of sneaking back in as a review.
  const { data, error } = await supabase.from(table).delete().eq("user_id", userId).eq(key, id).select("id").maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "No progress found for this card.");

  // A kanji's reading cards are only ever (re)created together, as a batch, when the kanji
  // itself is introduced (see introduceKanji) -- that insert isn't upsert-safe, so if any
  // reading row for this kanji survived, re-introducing it later would crash on a unique
  // constraint conflict. So resetting the meaning card forgets the whole kanji, readings
  // included; resetting a single reading card only forgets that one reading.
  if (type === "meaning") {
    const { error: readingsError } = await supabase
      .from("user_kanji_reading_progress")
      .delete()
      .eq("user_id", userId)
      .eq("kanji_id", id);
    if (readingsError) throw new ApiError(500, readingsError.message);
  }
}

export async function suspendCard(supabase: AppSupabaseClient, userId: string, type: CardType, id: number): Promise<void> {
  const { table, key } = PROGRESS_TABLES[CARD_TYPE_TO_EXERCISE_TYPE[type]];

  const { data, error } = await supabase
    .from(table)
    .update({ status: "suspended" })
    .eq("user_id", userId)
    .eq(key, id)
    .select("id")
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, "No progress found for this card.");
}
