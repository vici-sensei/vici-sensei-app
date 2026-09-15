import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { ExerciseType } from "@/lib/srs/constants";

export interface PracticeAnswerInput {
  exerciseType: ExerciseType;
  correct: boolean;
  kanjiId?: number | null;
  wordId?: number | null;
  hiraganaId?: number | null;
  katakanaId?: number | null;
}

/** Records one Practice-mode answer to practice_logs (supabase/migrations/20261127_practice_
 * counts_toward_streak_and_xp.sql) -- a plain insert-only log with no relationship to any
 * user_*_progress row, so this can never affect SRS state. Its AFTER INSERT trigger is the only
 * thing that reacts to it: it awards XP (10 correct / 2 wrong, same as a graded review) and
 * counts today as an active streak day, exactly like usePracticeQueue's rate() already treats
 * this as a fire-and-forget side effect -- a failure here only costs this one answer's XP/streak
 * credit, never the practice session itself, so callers shouldn't await this to advance the UI. */
export async function recordPracticeAnswer(supabase: AppSupabaseClient, userId: string, input: PracticeAnswerInput): Promise<void> {
  const { error } = await supabase.from("practice_logs").insert({
    user_id: userId,
    exercise_type: input.exerciseType,
    correct: input.correct,
    kanji_id: input.kanjiId ?? null,
    word_id: input.wordId ?? null,
    hiragana_id: input.hiraganaId ?? null,
    katakana_id: input.katakanaId ?? null,
  });
  if (error) throw new Error(error.message);
}
