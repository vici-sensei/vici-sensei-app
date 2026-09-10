import type { AppSupabaseClient } from "@/lib/supabase/types";

export interface PracticeKanaCard {
  id: number;
  character: string;
  romaji: string;
  script: "hiragana" | "katakana";
  /** True for a bonus card pulled straight from hiragana/katakana (study_enabled = false) rather
   * than from a user_*_progress row -- see fetchBonusHiragana/fetchBonusKatakana. */
  bonus: boolean;
}

interface SeenHiraganaRow {
  hiragana_id: number;
  hiragana: { character: string; romaji: string } | null;
}

interface SeenKatakanaRow {
  katakana_id: number;
  katakana: { character: string; romaji: string } | null;
}

/** Every hiragana character this user has ever been introduced to (any status, including
 * suspended) -- a row existing in user_hiragana_progress at all means it was shown at least
 * once (see introduce_hiragana/introduce_hiragana_examples). Backs the free-practice mode
 * (app/(study)/study/practice), which must never touch SRS state or review history: this is a
 * plain SELECT against tables the existing "Users manage own user_hiragana_progress"/
 * "Authenticated users can read hiragana" RLS policies already allow for this user, not an RPC
 * -- there is nothing here that could write anything. */
export async function fetchSeenHiragana(supabase: AppSupabaseClient, userId: string): Promise<PracticeKanaCard[]> {
  const { data, error } = await supabase
    .from("user_hiragana_progress")
    .select("hiragana_id, hiragana:hiragana_id(character, romaji)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SeenHiraganaRow[])
    .filter((row) => row.hiragana !== null)
    .map((row) => ({
      id: row.hiragana_id,
      character: row.hiragana!.character,
      romaji: row.hiragana!.romaji,
      script: "hiragana" as const,
      bonus: false,
    }));
}

/** Same as fetchSeenHiragana, for katakana. */
export async function fetchSeenKatakana(supabase: AppSupabaseClient, userId: string): Promise<PracticeKanaCard[]> {
  const { data, error } = await supabase
    .from("user_katakana_progress")
    .select("katakana_id, katakana:katakana_id(character, romaji)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SeenKatakanaRow[])
    .filter((row) => row.katakana !== null)
    .map((row) => ({
      id: row.katakana_id,
      character: row.katakana!.character,
      romaji: row.katakana!.romaji,
      script: "katakana" as const,
      bonus: false,
    }));
}

interface BonusKanaRow {
  id: number;
  character: string;
  romaji: string;
}

/** Whether this user has mastered (status review/relearning) every hiragana character that's
 * currently enabled for study -- the same "finished learning all hiragana" threshold the DB
 * itself already uses to gate katakana (hiragana_auto_activate_katakana,
 * enforce_katakana_requires_hiragana_mastered) and that fetchStudyStats surfaces as
 * hiragana_mastered on /dashboard. entry_kind != 'rule' matches get_level_progress's
 * hiragana_reading total (character + example rows; rule rows never get a progress row at all,
 * see 20260906_mastery_denominators_respect_study_enabled.sql). */
export async function fetchHiraganaMastered(supabase: AppSupabaseClient, userId: string): Promise<boolean> {
  const [totalResult, learnedResult] = await Promise.all([
    supabase.from("hiragana").select("id", { count: "exact", head: true }).eq("study_enabled", true).neq("entry_kind", "rule"),
    supabase
      .from("user_hiragana_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["review", "relearning"]),
  ]);
  if (totalResult.error) throw new Error(totalResult.error.message);
  if (learnedResult.error) throw new Error(learnedResult.error.message);
  const total = totalResult.count ?? 0;
  return total > 0 && (learnedResult.count ?? 0) >= total;
}

/** Same as fetchHiraganaMastered, for katakana. */
export async function fetchKatakanaMastered(supabase: AppSupabaseClient, userId: string): Promise<boolean> {
  const [totalResult, learnedResult] = await Promise.all([
    supabase.from("katakana").select("id", { count: "exact", head: true }).eq("study_enabled", true).neq("entry_kind", "rule"),
    supabase
      .from("user_katakana_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["review", "relearning"]),
  ]);
  if (totalResult.error) throw new Error(totalResult.error.message);
  if (learnedResult.error) throw new Error(learnedResult.error.message);
  const total = totalResult.count ?? 0;
  return total > 0 && (learnedResult.count ?? 0) >= total;
}

/** The rare/historical hiragana characters study_enabled excludes from /study -- these can never
 * gain a user_hiragana_progress row (see introduce_hiragana), so there's no "seen" table to read
 * them from; this reads straight off public.hiragana instead. Only meaningful once
 * fetchHiraganaMastered is true -- callers gate on that, this function doesn't check it itself. */
export async function fetchBonusHiragana(supabase: AppSupabaseClient): Promise<PracticeKanaCard[]> {
  const { data, error } = await supabase
    .from("hiragana")
    .select("id, character, romaji")
    .eq("study_enabled", false)
    .neq("entry_kind", "rule");
  if (error) throw new Error(error.message);
  return ((data ?? []) as BonusKanaRow[]).map((row) => ({
    id: row.id,
    character: row.character,
    romaji: row.romaji,
    script: "hiragana" as const,
    bonus: true,
  }));
}

/** Same as fetchBonusHiragana, for katakana. */
export async function fetchBonusKatakana(supabase: AppSupabaseClient): Promise<PracticeKanaCard[]> {
  const { data, error } = await supabase
    .from("katakana")
    .select("id, character, romaji")
    .eq("study_enabled", false)
    .neq("entry_kind", "rule");
  if (error) throw new Error(error.message);
  return ((data ?? []) as BonusKanaRow[]).map((row) => ({
    id: row.id,
    character: row.character,
    romaji: row.romaji,
    script: "katakana" as const,
    bonus: true,
  }));
}
