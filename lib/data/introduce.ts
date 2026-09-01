import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";

// Raised by introduce_kanji/introduce_vocabulary/introduce_hiragana/introduce_katakana
// (supabase/migrations/20260820_enforce_daily_new_card_cap.sql) for both "already introduced"
// and "daily cap reached" -- both mean "nothing to introduce here", which useStudyQueue already
// treats as non-fatal (silently drops the card) via the existing 409 handling in introduceCard's
// catch block.
const CAP_OR_DUPLICATE_ERRCODE = "P0002";

// hiragana/katakana are handled by introduceHiraganaCharacter/introduceKatakanaCharacter below,
// not this generic path -- introduce_hiragana/introduce_katakana no longer return void (see
// supabase/migrations/20260910_persist_kana_pack_completion.sql), since whether a whole
// gojuon_row pack just completed -- and, if so, every character id in it -- is now decided
// entirely server-side instead of by client-side bookkeeping (useStudyQueue.ts used to track
// this itself via refs that reset on every page load, which is exactly what let a pack get split
// across sessions).
export type IntroduceKind = "kanji" | "vocabulary" | "hiragana_rule" | "katakana_rule";

const INTRODUCE_RPCS: Record<IntroduceKind, { rpc: string; param: string }> = {
  kanji: { rpc: "introduce_kanji", param: "p_kanji_id" },
  vocabulary: { rpc: "introduce_vocabulary", param: "p_word_id" },
  hiragana_rule: { rpc: "introduce_hiragana_rule", param: "p_hiragana_id" },
  katakana_rule: { rpc: "introduce_katakana_rule", param: "p_katakana_id" },
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

export interface KanaPackResult {
  /** True iff this call's insert was the one that completed the whole gojuon_row pack -- i.e.
   * every study_enabled entry_kind = 'character' row sharing this character's gojuon_row now has
   * a progress row for this user. Authoritative and server-decided: see introduce_hiragana/
   * introduce_katakana in 20260910_persist_kana_pack_completion.sql. */
  packCompleted: boolean;
  /** Every hiragana_id/katakana_id in the just-completed pack, in gojuon sort order -- null when
   * packCompleted is false. Pass straight to getHiraganaReadingCards/getKatakanaReadingCards. */
  ids: number[] | null;
}

export async function introduceHiraganaCharacter(
  supabase: AppSupabaseClient,
  userId: string,
  hiraganaId: number,
  timezone: string,
  sessionId?: number
): Promise<KanaPackResult> {
  const { data, error } = await supabase.rpc("introduce_hiragana", {
    p_user_id: userId,
    p_hiragana_id: hiraganaId,
    p_timezone: timezone,
    p_session_id: sessionId ?? null,
  });

  if (error) throw new ApiError(error.code === CAP_OR_DUPLICATE_ERRCODE ? 409 : 500, error.message);
  const row = (data as { pack_completed: boolean; hiragana_ids: number[] | null }[])[0];
  return { packCompleted: row?.pack_completed ?? false, ids: row?.hiragana_ids ?? null };
}

export async function introduceKatakanaCharacter(
  supabase: AppSupabaseClient,
  userId: string,
  katakanaId: number,
  timezone: string,
  sessionId?: number
): Promise<KanaPackResult> {
  const { data, error } = await supabase.rpc("introduce_katakana", {
    p_user_id: userId,
    p_katakana_id: katakanaId,
    p_timezone: timezone,
    p_session_id: sessionId ?? null,
  });

  if (error) throw new ApiError(error.code === CAP_OR_DUPLICATE_ERRCODE ? 409 : 500, error.message);
  const row = (data as { pack_completed: boolean; katakana_ids: number[] | null }[])[0];
  return { packCompleted: row?.pack_completed ?? false, ids: row?.katakana_ids ?? null };
}
