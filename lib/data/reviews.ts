import type { AppSupabaseClient } from "@/lib/supabase/types";
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
    p_hiragana_id: input.hiragana_id ?? null,
    p_katakana_id: input.katakana_id ?? null,
    p_user_answer: input.user_answer ?? null,
    p_session_id: input.session_id ?? null,
  });

  if (error) {
    if (error.code === NOT_FOUND_ERRCODE) throw new ApiError(404, error.message);
    if (error.code === INVALID_STATE_ERRCODE) throw new ApiError(400, error.message);
    throw new ApiError(500, error.message);
  }

  // submit_review now returns a one-row table (see 20260901_submit_review_resurfaces_today.sql)
  // instead of a bare log id.
  const row = (data as { review_log_id: number; resurfaces_today: boolean }[])[0];
  return { reviewLogId: row.review_log_id, resurfacesToday: row.resurfaces_today };
}

// Raised by undo_review (supabase/migrations/20260911_drill_mode_and_atomic_undo.sql) when
// there's no matching not-yet-undone review to restore -- same code submit_review uses for its
// own not-found case, reused here for consistency (each RPC's callers only ever see their own).
const UNDO_NOT_FOUND_ERRCODE = "SR404";

export async function undoReview(supabase: AppSupabaseClient, userId: string, reviewLogId?: number): Promise<void> {
  // Single atomic RPC: finds the target log (explicit id, or the latest not-yet-undone one),
  // restores the *_before snapshot onto the right progress table, and marks the log undone, all
  // in one transaction -- previously this was a SELECT plus two separate client-issued UPDATEs
  // with no transaction tying them together, so a dropped connection between the two updates
  // could leave the progress row restored but the log still undone = false, and two concurrent
  // undo calls (double-click, a second tab) could both read the same snapshot and race to write
  // it.
  const { error } = await supabase.rpc("undo_review", {
    p_user_id: userId,
    p_review_log_id: reviewLogId ?? null,
  });

  if (error) {
    if (error.code === UNDO_NOT_FOUND_ERRCODE) throw new ApiError(404, error.message);
    throw new ApiError(500, error.message);
  }
}
