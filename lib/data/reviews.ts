import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { DueCard, ReviewRequestBody, SubmitReviewResult } from "@/lib/types";
import type { ExerciseType } from "@/lib/srs/constants";
import { ApiError } from "@/lib/api/client";
import { previewRatingLabels, type ProgressRow } from "@/lib/srs/scheduler";

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
    p_triggered_by_review_log_id: input.triggered_by_review_log_id ?? null,
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

export interface ResolveConfirmedSiblingsInput {
  exerciseType: "vocab_meaning" | "kanji_reading";
  kanjiId?: number;
  wordId?: number;
  kanjiWordId?: number;
  confirmedTexts: string[];
}

interface ResolvedSiblingRow extends ProgressRow {
  exercise_type: ExerciseType;
  progress_id: number;
  kanji_id: number | null;
  word_id: number | null;
  kanji_word_id: number | null;
  kanji_char: string | null;
  word: string;
  kana_reading: string | null;
  furiganas: string[] | null;
  word_meanings: string[] | null;
}

/**
 * Read-only lookup, called right after a vocab_meaning/kanji_reading review whose student also
 * confirmed a sibling homograph's meaning/reading along the way (see checkVocabMeaningAnswer/
 * checkKanjiReadingAnswer's "alternate" outcome). Mutates nothing -- resolve_confirmed_siblings
 * re-derives which sibling(s) actually own each confirmed text from public.vocabulary/kanji_word
 * itself (never trusts an id from the client), and returns enough of their current SRS state to
 * build a real DueCard for ReviewCardRateSibling, previews included. The caller still has to
 * submit a genuine submit_review once the student picks a rating for it -- this alone changes
 * nothing.
 */
export async function resolveConfirmedSiblings(
  supabase: AppSupabaseClient,
  userId: string,
  input: ResolveConfirmedSiblingsInput
): Promise<DueCard[]> {
  if (input.confirmedTexts.length === 0) return [];

  const { data, error } = await supabase.rpc("resolve_confirmed_siblings", {
    p_user_id: userId,
    p_exercise_type: input.exerciseType,
    p_kanji_id: input.kanjiId ?? null,
    p_word_id: input.wordId ?? null,
    p_kanji_word_id: input.kanjiWordId ?? null,
    p_confirmed_texts: input.confirmedTexts,
  });

  if (error) throw new ApiError(500, error.message);

  return ((data ?? []) as ResolvedSiblingRow[]).map((row) => ({
    exercise_type: row.exercise_type,
    progress_id: row.progress_id,
    kanji_id: row.kanji_id,
    word_id: row.word_id,
    kanji_word_id: row.kanji_word_id,
    hiragana_id: null,
    katakana_id: null,
    kanji_char: row.kanji_char,
    kanji_meanings: null,
    word: row.word,
    kana_reading: row.kana_reading,
    romaji_reading: null,
    other_readings: null,
    furiganas: row.furiganas,
    word_meanings: row.word_meanings,
    all_word_meanings: null,
    all_word_readings: null,
    known_kanji_chars: null,
    kana_character: null,
    kana_romaji: null,
    kana_type: null,
    drill_streak: null,
    drill_mode: false,
    rating_previews: previewRatingLabels(row),
    status: row.status,
  }));
}
