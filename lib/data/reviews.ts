import type { AppSupabaseClient } from "@/lib/supabase/types";
import { PROGRESS_TABLES } from "@/lib/srs/progressTables";
import type { ReviewRequestBody, SubmitReviewResult } from "@/lib/types";
import { ApiError } from "@/lib/api/client";

export type ReviewInput = ReviewRequestBody;

// Raised by submit_review (supabase/migrations/20260820_submit_review_rpc.sql) for its
// input-validation/invalid-status and not-found cases. Preserves the exact err.status === 400
// || 404 distinction useStudyQueue.ts's rate() relies on ("stale card, drop silently" vs.
// "transient, retry").
const NOT_FOUND_ERRCODE = "SR404";
const INVALID_STATE_ERRCODE = "SR400";

export async function submitReview(supabase: AppSupabaseClient, userId: string, input: ReviewInput): Promise<SubmitReviewResult> {
  const { data, error } = await supabase.rpc("submit_review", {
    p_user_id: userId,
    p_exercise_type: input.exercise_type,
    p_rating: input.rating,
    p_kanji_id: input.kanji_id ?? null,
    p_word_id: input.word_id ?? null,
    p_kanji_word_id: input.kanji_word_id ?? null,
    p_user_answer: input.user_answer ?? null,
  });

  if (error) {
    if (error.code === NOT_FOUND_ERRCODE) throw new ApiError(404, error.message);
    if (error.code === INVALID_STATE_ERRCODE) throw new ApiError(400, error.message);
    throw new ApiError(500, error.message);
  }

  return { reviewLogId: data as number };
}

export async function undoReview(supabase: AppSupabaseClient, userId: string, reviewLogId?: number): Promise<void> {
  let logQuery = supabase.from("review_logs").select("*").eq("user_id", userId).eq("undone", false);
  logQuery = reviewLogId ? logQuery.eq("id", reviewLogId) : logQuery.order("reviewed_at", { ascending: false }).limit(1);

  const { data: logs, error: logError } = await logQuery;
  if (logError) throw new ApiError(500, logError.message);

  const log = logs?.[0];
  if (!log) throw new ApiError(404, "No undoable review found.");

  const exerciseType = log.exercise_type as keyof typeof PROGRESS_TABLES;
  const { table, key } = PROGRESS_TABLES[exerciseType];

  let keyValue: number;
  if (exerciseType === "kanji_meaning") {
    keyValue = log.kanji_id;
  } else if (exerciseType === "vocab_meaning") {
    keyValue = log.word_id;
  } else {
    const { data: kanjiWord, error: kanjiWordError } = await supabase
      .from("kanji_word")
      .select("id")
      .eq("id_kanji", log.kanji_id)
      .eq("id_word", log.word_id)
      .single();
    if (kanjiWordError) throw new ApiError(500, kanjiWordError.message);
    keyValue = kanjiWord.id;
  }

  const { error: restoreError } = await supabase
    .from(table)
    .update({
      status: log.status_before,
      ease_factor: log.ease_factor_before,
      interval_days: log.interval_before,
      repetitions: log.repetitions_before,
      lapses: log.lapses_before,
      learning_step: log.learning_step_before,
      due_at: log.due_at_before,
    })
    .eq("user_id", userId)
    .eq(key, keyValue);

  if (restoreError) throw new ApiError(500, restoreError.message);

  const { error: markUndoneError } = await supabase.from("review_logs").update({ undone: true }).eq("id", log.id);
  if (markUndoneError) throw new ApiError(500, markUndoneError.message);
}
