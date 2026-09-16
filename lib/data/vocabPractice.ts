import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JlptLevel } from "@/lib/srs/constants";

export interface PracticeVocabCard {
  kind: "vocab_meaning";
  /** user_vocabulary_progress key (word_id) -- see lib/srs/progressTables.ts. */
  id: number;
  word: string;
  kanaReading: string | null;
  furiganas: string[] | null;
  primaryMeanings: string[];
  /** primary_meanings + other_meanings from every vocabulary row sharing this word's word AND
   * kana_reading (see get_vocab_meaning_pool, 20261210_vocab_meaning_pool_includes_other_meanings.sql)
   * -- same "alternate, not just this row's target sense" pool get_due_cards/complete_vocab_batch
   * give a /study vocab_meaning card, now also given here so a practice-mode card doesn't silently
   * skip homonym-sibling/other_meanings credit that /study already grants. */
  allPrimaryMeanings: string[];
}

interface SeenVocabMeaningRow {
  word_id: number;
  word: string;
  kana_reading: string | null;
  furiganas: string[] | null;
  primary_meanings: string[] | null;
  all_primary_word_meanings: string[] | null;
  jlpt_level: string | null;
}

/** Every vocabulary word this user has ever been introduced to (any non-suspended, non-pending
 * status), scoped to the JLPT level(s) currently enabled for them -- mirrors
 * fetchSeenHiragana/fetchSeenKatakana for the free-practice mode (app/(study)/study/practice),
 * which must never touch SRS state. Excludes suspended and still-pending-batch rows (a word
 * mid-introduction, not yet actually shown) and words since disabled (study_enabled = false),
 * matching get_due_cards. Goes through get_seen_vocab_meaning_cards (an RPC, unlike
 * fetchSeenKanjiMeaning/fetchSeenKanjiReading's plain embedded selects) because it needs the same
 * cross-row get_vocab_meaning_pool aggregation get_due_cards/complete_vocab_batch use -- a plain
 * PostgREST select can't express that correlated per-row subquery. */
export async function fetchSeenVocabMeaning(
  supabase: AppSupabaseClient,
  userId: string,
  enabledLevels: readonly JlptLevel[]
): Promise<PracticeVocabCard[]> {
  const { data, error } = await supabase.rpc("get_seen_vocab_meaning_cards", {
    p_user_id: userId,
    p_enabled_levels: enabledLevels as string[],
  });
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SeenVocabMeaningRow[]).map((row) => ({
    kind: "vocab_meaning" as const,
    id: row.word_id,
    word: row.word,
    kanaReading: row.kana_reading,
    furiganas: row.furiganas,
    primaryMeanings: row.primary_meanings ?? [],
    allPrimaryMeanings: row.all_primary_word_meanings ?? [],
  }));
}
