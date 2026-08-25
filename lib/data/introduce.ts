import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";

// Raised by introduce_kanji/introduce_vocabulary/introduce_hiragana/introduce_katakana
// (supabase/migrations/20260820_enforce_daily_new_card_cap.sql) for both "already introduced"
// and "daily cap reached" -- both mean "nothing to introduce here", which useStudyQueue already
// treats as non-fatal (silently drops the card) via the existing 409 handling in introduceCard's
// catch block.
const CAP_OR_DUPLICATE_ERRCODE = "P0002";

export type IntroduceKind = "kanji" | "vocabulary" | "hiragana" | "katakana";

const INTRODUCE_RPCS: Record<IntroduceKind, { rpc: string; param: string }> = {
  kanji: { rpc: "introduce_kanji", param: "p_kanji_id" },
  vocabulary: { rpc: "introduce_vocabulary", param: "p_word_id" },
  hiragana: { rpc: "introduce_hiragana", param: "p_hiragana_id" },
  katakana: { rpc: "introduce_katakana", param: "p_katakana_id" },
};

export async function introduceCard(
  supabase: AppSupabaseClient,
  kind: IntroduceKind,
  userId: string,
  itemId: number,
  timezone: string,
  sessionId?: number
): Promise<void> {
  const { rpc, param } = INTRODUCE_RPCS[kind];
  const { error } = await supabase.rpc(rpc, {
    p_user_id: userId,
    [param]: itemId,
    p_timezone: timezone,
    p_session_id: sessionId ?? null,
  });

  if (error) throw new ApiError(error.code === CAP_OR_DUPLICATE_ERRCODE ? 409 : 500, error.message);
}
