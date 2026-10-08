import type { AppSupabaseClient } from "@/lib/supabase/types";
import { KANA_TABLES, type KanaScript } from "./kanaScripts";

export interface PracticeKanaCard {
  id: number;
  character: string;
  romaji: string;
  script: "hiragana" | "katakana";
  /** True for a bonus card pulled straight from hiragana/katakana (study_enabled = false) rather
   * than from a user_*_progress row -- see fetchBonusHiragana/fetchBonusKatakana. */
  bonus: boolean;
}

/** Every character of `script` this user has ever been introduced to (any status, including
 * suspended) -- a row existing in user_hiragana_progress/user_katakana_progress at all means it was
 * shown at least once (see introduce_hiragana/introduce_hiragana_examples). Backs the free-practice
 * mode (app/(study)/study/practice), which must never touch SRS state or review history: this is a
 * plain SELECT against tables the existing "Users manage own user_hiragana_progress"/
 * "Authenticated users can read hiragana" RLS policies already allow for this user, not an RPC
 * -- there is nothing here that could write anything. */
async function fetchSeenKana(supabase: AppSupabaseClient, userId: string, script: KanaScript): Promise<PracticeKanaCard[]> {
  const { progressTable, idColumn } = KANA_TABLES[script];
  const { data, error } = await supabase
    .from(progressTable)
    .select(`${idColumn}, ${script}:${idColumn}(character, romaji)`)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  // Each row is { <script>_id: number, <script>: { character, romaji } | null }.
  return ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .filter((row) => row[script] !== null)
    .map((row) => {
      const kana = row[script] as { character: string; romaji: string };
      return { id: row[idColumn] as number, character: kana.character, romaji: kana.romaji, script, bonus: false };
    });
}

export function fetchSeenHiragana(supabase: AppSupabaseClient, userId: string): Promise<PracticeKanaCard[]> {
  return fetchSeenKana(supabase, userId, "hiragana");
}

/** Same as fetchSeenHiragana, for katakana. */
export function fetchSeenKatakana(supabase: AppSupabaseClient, userId: string): Promise<PracticeKanaCard[]> {
  return fetchSeenKana(supabase, userId, "katakana");
}

/** Whether this user has mastered (status review/relearning) every character of `script` that's
 * currently enabled for study -- the same "finished learning all hiragana" threshold the DB
 * itself already uses to gate katakana (hiragana_auto_activate_katakana,
 * enforce_katakana_requires_hiragana_mastered) and that fetchStudyStats surfaces as
 * hiragana_mastered on /dashboard. entry_kind != 'rule' matches get_level_progress's
 * hiragana_reading total (character + example rows; rule rows never get a progress row at all,
 * see 20260906_mastery_denominators_respect_study_enabled.sql). */
async function fetchKanaMastered(supabase: AppSupabaseClient, userId: string, script: KanaScript): Promise<boolean> {
  const { table, progressTable } = KANA_TABLES[script];
  const [totalResult, learnedResult] = await Promise.all([
    supabase.from(table).select("id", { count: "exact", head: true }).eq("study_enabled", true).neq("entry_kind", "rule"),
    supabase
      .from(progressTable)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["review", "relearning"]),
  ]);
  if (totalResult.error) throw new Error(totalResult.error.message);
  if (learnedResult.error) throw new Error(learnedResult.error.message);
  const total = totalResult.count ?? 0;
  return total > 0 && (learnedResult.count ?? 0) >= total;
}

export function fetchHiraganaMastered(supabase: AppSupabaseClient, userId: string): Promise<boolean> {
  return fetchKanaMastered(supabase, userId, "hiragana");
}

/** Same as fetchHiraganaMastered, for katakana. */
export function fetchKatakanaMastered(supabase: AppSupabaseClient, userId: string): Promise<boolean> {
  return fetchKanaMastered(supabase, userId, "katakana");
}

/** The rare/historical characters of `script` study_enabled excludes from /study -- these can never
 * gain a progress row (see introduce_hiragana), so there's no "seen" table to read them from; this
 * reads straight off public.hiragana/public.katakana instead. Only meaningful once the matching
 * fetch*Mastered is true -- callers gate on that, this function doesn't check it itself. */
async function fetchBonusKana(supabase: AppSupabaseClient, script: KanaScript): Promise<PracticeKanaCard[]> {
  const { data, error } = await supabase
    .from(KANA_TABLES[script].table)
    .select("id, character, romaji")
    .eq("study_enabled", false)
    .neq("entry_kind", "rule");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: number; character: string; romaji: string }>).map((row) => ({
    id: row.id,
    character: row.character,
    romaji: row.romaji,
    script,
    bonus: true,
  }));
}

export function fetchBonusHiragana(supabase: AppSupabaseClient): Promise<PracticeKanaCard[]> {
  return fetchBonusKana(supabase, "hiragana");
}

/** Same as fetchBonusHiragana, for katakana. */
export function fetchBonusKatakana(supabase: AppSupabaseClient): Promise<PracticeKanaCard[]> {
  return fetchBonusKana(supabase, "katakana");
}
