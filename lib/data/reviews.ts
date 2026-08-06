import type { AppSupabaseClient } from "@/lib/supabase/types";
import { EXERCISE_TYPES, type ExerciseType } from "@/lib/srs/constants";
import type { ReviewRequestBody } from "@/lib/types";
import { PROGRESS_TABLES } from "@/lib/srs/progressTables";
import { applyReview } from "@/lib/srs/scheduler";
import { ApiError } from "@/lib/api/client";

export type ReviewInput = ReviewRequestBody;

function validateReviewInput(input: ReviewInput): void {
  if (!EXERCISE_TYPES.includes(input.exercise_type)) {
    throw new ApiError(400, `Invalid exercise_type "${input.exercise_type}".`);
  }
  if (![0, 1, 2, 3].includes(input.rating)) {
    throw new ApiError(400, `Invalid rating "${input.rating}".`);
  }
}

export async function submitReview(supabase: AppSupabaseClient, userId: string, input: ReviewInput): Promise<void> {
  validateReviewInput(input);
  const { exercise_type, rating, user_answer } = input;

  const { table, key } = PROGRESS_TABLES[exercise_type];
  const keyValue =
    exercise_type === "kanji_meaning" ? input.kanji_id : exercise_type === "kanji_reading" ? input.kanji_word_id : input.word_id;

  if (keyValue === undefined) {
    throw new ApiError(400, `${key} is required for exercise_type "${exercise_type}".`);
  }

  const { data: current, error: currentError } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .eq(key, keyValue)
    .maybeSingle();

  if (currentError) throw new ApiError(500, currentError.message);
  if (!current) throw new ApiError(404, "No progress found for this card. Introduce it first.");
  if (current.status === "new" || current.status === "suspended") {
    throw new ApiError(400, `Cannot review a card with status "${current.status}".`);
  }

  const updated = applyReview(current, rating);

  const { error: updateError } = await supabase
    .from(table)
    .update({ ...updated, last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", current.id);

  if (updateError) throw new ApiError(500, updateError.message);

  let kanjiIdForLog: number | null = null;
  let wordIdForLog: number | null = null;

  if (exercise_type === "kanji_meaning") {
    kanjiIdForLog = current.kanji_id;
  } else if (exercise_type === "vocab_meaning") {
    wordIdForLog = current.word_id;
  } else {
    kanjiIdForLog = current.kanji_id;
    const { data: kanjiWord, error: kanjiWordError } = await supabase
      .from("kanji_word")
      .select("id_word")
      .eq("id", current.kanji_word_id)
      .single();
    if (kanjiWordError) throw new ApiError(500, kanjiWordError.message);
    wordIdForLog = kanjiWord.id_word;
  }

  const { data: openSession } = await supabase
    .from("study_sessions")
    .select("id")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: logError } = await supabase.from("review_logs").insert({
    user_id: userId,
    session_id: openSession?.id ?? null,
    exercise_type,
    kanji_id: kanjiIdForLog,
    word_id: wordIdForLog,
    rating,
    correct: rating >= 2,
    user_answer: user_answer ?? null,
    ease_factor_before: current.ease_factor,
    ease_factor_after: updated.ease_factor,
    interval_before: current.interval_days,
    interval_after: updated.interval_days,
    status_before: current.status,
    repetitions_before: current.repetitions,
    lapses_before: current.lapses,
    learning_step_before: current.learning_step,
    due_at_before: current.due_at,
  });

  if (logError) throw new ApiError(500, logError.message);
}

export async function undoReview(supabase: AppSupabaseClient, userId: string, reviewLogId?: number): Promise<void> {
  let logQuery = supabase.from("review_logs").select("*").eq("user_id", userId).eq("undone", false);
  logQuery = reviewLogId ? logQuery.eq("id", reviewLogId) : logQuery.order("reviewed_at", { ascending: false }).limit(1);

  const { data: logs, error: logError } = await logQuery;
  if (logError) throw new ApiError(500, logError.message);

  const log = logs?.[0];
  if (!log) throw new ApiError(404, "No undoable review found.");

  const exerciseType = log.exercise_type as ExerciseType;
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
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq(key, keyValue);

  if (restoreError) throw new ApiError(500, restoreError.message);

  const { error: markUndoneError } = await supabase.from("review_logs").update({ undone: true }).eq("id", log.id);
  if (markUndoneError) throw new ApiError(500, markUndoneError.message);
}
