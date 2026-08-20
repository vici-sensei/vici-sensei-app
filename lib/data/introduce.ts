import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";

// Raised by introduce_kanji/introduce_vocabulary (supabase/migrations/20260820_enforce_daily_new_card_cap.sql)
// for both "already introduced" and "daily cap reached" -- both mean "nothing to introduce
// here", which useStudyQueue already treats as non-fatal (silently drops the card) via the
// existing 409 handling in introduceCard's catch block.
const CAP_OR_DUPLICATE_ERRCODE = "P0002";

export async function introduceKanji(
  supabase: AppSupabaseClient,
  userId: string,
  kanjiId: number,
  dayStart: string,
  dayEnd: string,
  sessionId?: number
): Promise<void> {
  const { error } = await supabase.rpc("introduce_kanji", {
    p_user_id: userId,
    p_kanji_id: kanjiId,
    p_day_start: dayStart,
    p_day_end: dayEnd,
    p_session_id: sessionId ?? null,
  });

  if (error) throw new ApiError(error.code === CAP_OR_DUPLICATE_ERRCODE ? 409 : 500, error.message);
}

export async function introduceVocabulary(
  supabase: AppSupabaseClient,
  userId: string,
  wordId: number,
  dayStart: string,
  dayEnd: string,
  sessionId?: number
): Promise<void> {
  const { error } = await supabase.rpc("introduce_vocabulary", {
    p_user_id: userId,
    p_word_id: wordId,
    p_day_start: dayStart,
    p_day_end: dayEnd,
    p_session_id: sessionId ?? null,
  });

  if (error) throw new ApiError(error.code === CAP_OR_DUPLICATE_ERRCODE ? 409 : 500, error.message);
}
