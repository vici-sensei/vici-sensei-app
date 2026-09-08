import type { AppSupabaseClient } from "@/lib/supabase/types";

export interface PracticeKanaCard {
  id: number;
  character: string;
  romaji: string;
  script: "hiragana" | "katakana";
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
    .map((row) => ({ id: row.hiragana_id, character: row.hiragana!.character, romaji: row.hiragana!.romaji, script: "hiragana" as const }));
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
    .map((row) => ({ id: row.katakana_id, character: row.katakana!.character, romaji: row.katakana!.romaji, script: "katakana" as const }));
}
