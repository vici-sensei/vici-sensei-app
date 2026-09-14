import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JlptLevel } from "@/lib/srs/constants";

export interface PracticeVocabCard {
  kind: "vocab_meaning";
  /** user_vocabulary_progress key (word_id) -- see lib/srs/progressTables.ts. */
  id: number;
  word: string;
  kanaReading: string | null;
  furiganas: string[] | null;
  meanings: string[];
}

interface SeenVocabRow {
  word_id: number;
  pending_batch: boolean;
  vocabulary: {
    word: string;
    kana_reading: string | null;
    furiganas: string[] | null;
    meanings: string[] | null;
    jlpt_level: string | null;
    study_enabled: boolean;
  } | null;
}

/** Every vocabulary word this user has ever been introduced to (any non-suspended, non-pending
 * status), scoped to the JLPT level(s) currently enabled for them -- mirrors
 * fetchSeenHiragana/fetchSeenKatakana for the free-practice mode (app/(study)/study/practice),
 * which must never touch SRS state. Excludes suspended and still-pending-batch rows (a word
 * mid-introduction, not yet actually shown) and words since disabled (study_enabled = false),
 * matching get_due_cards. */
export async function fetchSeenVocabMeaning(
  supabase: AppSupabaseClient,
  userId: string,
  enabledLevels: readonly JlptLevel[]
): Promise<PracticeVocabCard[]> {
  const { data, error } = await supabase
    .from("user_vocabulary_progress")
    .select("word_id, pending_batch, vocabulary:word_id(word, kana_reading, furiganas, meanings, jlpt_level, study_enabled)")
    .eq("user_id", userId)
    .neq("status", "suspended");
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SeenVocabRow[])
    .filter(
      (row) =>
        !row.pending_batch &&
        row.vocabulary !== null &&
        row.vocabulary.study_enabled &&
        enabledLevels.includes(row.vocabulary.jlpt_level as JlptLevel)
    )
    .map((row) => ({
      kind: "vocab_meaning" as const,
      id: row.word_id,
      word: row.vocabulary!.word,
      kanaReading: row.vocabulary!.kana_reading,
      furiganas: row.vocabulary!.furiganas,
      meanings: row.vocabulary!.meanings ?? [],
    }));
}
