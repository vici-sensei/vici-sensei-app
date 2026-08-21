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

  const { data: current, error: fetchError } = await supabase
    .from(table)
    .select("status")
    .eq("user_id", userId)
    .eq(key, id)
    .maybeSingle();

  if (fetchError) throw new ApiError(500, fetchError.message);
  if (!current) throw new ApiError(404, "No progress found for this card.");

  if (current.status !== "suspended") {
    const { error } = await supabase
      .from(table)
      .update({ status: "suspended", status_before: current.status })
      .eq("user_id", userId)
      .eq(key, id);

    if (error) throw new ApiError(500, error.message);
  }

  // Suspending the meaning card pauses studying this kanji altogether, so its reading cards
  // -- which only ever exist alongside a meaning card, see resetCard -- pause with it.
  if (type === "meaning") await suspendKanjiReadings(supabase, userId, id);
}

async function suspendKanjiReadings(supabase: AppSupabaseClient, userId: string, kanjiId: number): Promise<void> {
  const { data: readings, error: fetchError } = await supabase
    .from("user_kanji_reading_progress")
    .select("status")
    .eq("user_id", userId)
    .eq("kanji_id", kanjiId)
    .neq("status", "suspended");

  if (fetchError) throw new ApiError(500, fetchError.message);
  if (!readings || readings.length === 0) return;

  // status_before must snapshot each row's own prior status, and the JS client can't express
  // "set column to another column's value" in a single bulk update -- so group by status and
  // issue one update per distinct value instead of one query per row.
  const statuses = [...new Set(readings.map((r) => r.status))];
  for (const status of statuses) {
    const { error } = await supabase
      .from("user_kanji_reading_progress")
      .update({ status: "suspended", status_before: status })
      .eq("user_id", userId)
      .eq("kanji_id", kanjiId)
      .eq("status", status);

    if (error) throw new ApiError(500, error.message);
  }
}

// Reverses suspendCard: restores the phase (new/learning/review/relearning) it snapshotted
// into status_before before overwriting status with 'suspended'. Rows suspended before
// status_before existed have no snapshot to restore, so those fall back to 'new'.
export async function reactivateCard(supabase: AppSupabaseClient, userId: string, type: CardType, id: number): Promise<void> {
  const { table, key } = PROGRESS_TABLES[CARD_TYPE_TO_EXERCISE_TYPE[type]];

  const { data: current, error: fetchError } = await supabase
    .from(table)
    .select("status, status_before")
    .eq("user_id", userId)
    .eq(key, id)
    .maybeSingle();

  if (fetchError) throw new ApiError(500, fetchError.message);
  if (!current) throw new ApiError(404, "No progress found for this card.");
  if (current.status !== "suspended") throw new ApiError(400, "This card is not suspended.");

  const { error } = await supabase
    .from(table)
    .update({ status: current.status_before ?? "new", status_before: null })
    .eq("user_id", userId)
    .eq(key, id);

  if (error) throw new ApiError(500, error.message);

  // Reactivating the meaning card resumes studying this kanji altogether, so its reading cards
  // -- suspended alongside it, see suspendCard -- resume with it too.
  if (type === "meaning") await reactivateKanjiReadings(supabase, userId, id);
}

async function reactivateKanjiReadings(supabase: AppSupabaseClient, userId: string, kanjiId: number): Promise<void> {
  const { data: readings, error: fetchError } = await supabase
    .from("user_kanji_reading_progress")
    .select("status_before")
    .eq("user_id", userId)
    .eq("kanji_id", kanjiId)
    .eq("status", "suspended");

  if (fetchError) throw new ApiError(500, fetchError.message);
  if (!readings || readings.length === 0) return;

  // status_before restores each row's own prior phase, and the JS client can't express "set
  // column to another column's value" in a single bulk update -- so group by status_before and
  // issue one update per distinct value instead of one query per row.
  const statusBefores = [...new Set(readings.map((r) => r.status_before))];
  for (const statusBefore of statusBefores) {
    const query = supabase
      .from("user_kanji_reading_progress")
      .update({ status: statusBefore ?? "new", status_before: null })
      .eq("user_id", userId)
      .eq("kanji_id", kanjiId)
      .eq("status", "suspended");

    const { error } = await (statusBefore === null ? query.is("status_before", null) : query.eq("status_before", statusBefore));

    if (error) throw new ApiError(500, error.message);
  }
}
