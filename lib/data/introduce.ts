import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";
import type { KanaScript } from "./kanaScripts";

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
// across sessions). hiragana_rule/katakana_rule are handled by introduceHiraganaRule/
// introduceKatakanaRule below for the same reason as of
// supabase/migrations/20261024_atomic_rule_example_handoff.sql: introduce_hiragana_rule/
// introduce_katakana_rule no longer return void either, since answering a rule now atomically
// introduces that kana_type's own example pack (sokuon/yoon/n_gemination/choonpu/extended) too,
// instead of leaving that to a separate, later poll.
export type IntroduceKind = "kanji" | "vocabulary" | "kanji_basics";

const INTRODUCE_RPCS: Record<IntroduceKind, { rpc: string; param: string }> = {
  kanji: { rpc: "introduce_kanji", param: "p_kanji_id" },
  vocabulary: { rpc: "introduce_vocabulary", param: "p_word_id" },
  // itemId here is the step number (1, 2, or 3) -- see NewKanjiBasicsCandidate.
  kanji_basics: { rpc: "introduce_kanji_basics", param: "p_step" },
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

// The introduce_* functions of the two scripts are twins: they differ only in their names, in the
// name of the id argument they take and in the name of the id-list column they return.
const KANA_INTRODUCE = {
  hiragana: {
    character: "introduce_hiragana",
    rule: "introduce_hiragana_rule",
    idParam: "p_hiragana_id",
    idsColumn: "hiragana_ids",
  },
  katakana: {
    character: "introduce_katakana",
    rule: "introduce_katakana_rule",
    idParam: "p_katakana_id",
    idsColumn: "katakana_ids",
  },
} as const satisfies Record<KanaScript, { character: string; rule: string; idParam: string; idsColumn: string }>;

/** Calls one of the introduce_hiragana / introduce_katakana functions (or their _rule twins) and
 * returns the first row it answers with (they all return a single-row set). */
async function callKanaIntroduce(
  supabase: AppSupabaseClient,
  rpc: string,
  idParam: string,
  userId: string,
  kanaId: number,
  timezone: string,
  sessionId?: number
): Promise<Record<string, unknown> | undefined> {
  const { data, error } = await supabase.rpc(rpc, {
    p_user_id: userId,
    [idParam]: kanaId,
    p_timezone: timezone,
    p_session_id: sessionId ?? null,
  });

  if (error) throw new ApiError(error.code === CAP_OR_DUPLICATE_ERRCODE ? 409 : 500, error.message);
  return (data as Record<string, unknown>[])[0];
}

async function introduceKanaCharacter(
  supabase: AppSupabaseClient,
  script: KanaScript,
  userId: string,
  kanaId: number,
  timezone: string,
  sessionId?: number
): Promise<KanaPackResult> {
  const { character, idParam, idsColumn } = KANA_INTRODUCE[script];
  const row = await callKanaIntroduce(supabase, character, idParam, userId, kanaId, timezone, sessionId);
  return {
    packCompleted: (row?.pack_completed as boolean | undefined) ?? false,
    ids: (row?.[idsColumn] as number[] | null | undefined) ?? null,
  };
}

export function introduceHiraganaCharacter(
  supabase: AppSupabaseClient,
  userId: string,
  hiraganaId: number,
  timezone: string,
  sessionId?: number
): Promise<KanaPackResult> {
  return introduceKanaCharacter(supabase, "hiragana", userId, hiraganaId, timezone, sessionId);
}

export function introduceKatakanaCharacter(
  supabase: AppSupabaseClient,
  userId: string,
  katakanaId: number,
  timezone: string,
  sessionId?: number
): Promise<KanaPackResult> {
  return introduceKanaCharacter(supabase, "katakana", userId, katakanaId, timezone, sessionId);
}

// Answering a rule card atomically introduces that kana_type's own example pack too (whatever
// fits today's remaining cap -- see 20261024_atomic_rule_example_handoff.sql), returning its ids
// so useStudyQueue can splice the reading cards in immediately, contiguous with the rule, the
// same way introduceHiraganaCharacter/introduceKatakanaCharacter above hand off a just-completed
// gojuon pack. Empty for rule kana_types with no example pack (seion/dakuten/handakuten).
async function introduceKanaRule(
  supabase: AppSupabaseClient,
  script: KanaScript,
  userId: string,
  kanaId: number,
  timezone: string,
  sessionId?: number
): Promise<number[]> {
  const { rule, idParam, idsColumn } = KANA_INTRODUCE[script];
  const row = await callKanaIntroduce(supabase, rule, idParam, userId, kanaId, timezone, sessionId);
  return (row?.[idsColumn] as number[] | null | undefined) ?? [];
}

export function introduceHiraganaRule(
  supabase: AppSupabaseClient,
  userId: string,
  hiraganaId: number,
  timezone: string,
  sessionId?: number
): Promise<number[]> {
  return introduceKanaRule(supabase, "hiragana", userId, hiraganaId, timezone, sessionId);
}

export function introduceKatakanaRule(
  supabase: AppSupabaseClient,
  userId: string,
  katakanaId: number,
  timezone: string,
  sessionId?: number
): Promise<number[]> {
  return introduceKanaRule(supabase, "katakana", userId, katakanaId, timezone, sessionId);
}
