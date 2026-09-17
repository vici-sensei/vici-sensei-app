import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JlptLevel } from "@/lib/srs/constants";

export interface PracticeKanjiMeaningCard {
  kind: "kanji_meaning";
  /** user_kanji_meaning_progress key -- see lib/srs/progressTables.ts. */
  id: number;
  kanjiChar: string;
  meanings: string[];
}

export interface PracticeKanjiReadingCard {
  kind: "kanji_reading";
  /** user_kanji_reading_progress key -- see lib/srs/progressTables.ts. */
  id: number;
  kanjiId: number;
  kanjiChar: string;
  kanjiMeanings: string[];
  word: string;
  kanaReading: string | null;
  romajiReading: string | null;
  otherReadings: string[] | null;
  furiganas: string[] | null;
  primaryWordMeanings: string[] | null;
}

interface SeenKanjiMeaningRow {
  kanji_id: number;
  kanji: { kanji: string; meanings: string[] | null; level: string | null } | null;
}

/** Every kanji this user has ever been introduced to (any non-suspended status), scoped to the
 * JLPT level(s) currently enabled for them -- mirrors fetchSeenHiragana/fetchSeenKatakana for
 * the free-practice mode (app/(study)/study/practice), which must never touch SRS state. Plain
 * SELECT against the existing "Users manage own user_kanji_meaning_progress" RLS policy, same
 * reasoning as kana's own fetchers. Excludes suspended cards, matching get_due_cards. */
export async function fetchSeenKanjiMeaning(
  supabase: AppSupabaseClient,
  userId: string,
  enabledLevels: readonly JlptLevel[]
): Promise<PracticeKanjiMeaningCard[]> {
  const { data, error } = await supabase
    .from("user_kanji_meaning_progress")
    .select("kanji_id, kanji:kanji_id(kanji, meanings, level)")
    .eq("user_id", userId)
    .neq("status", "suspended");
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SeenKanjiMeaningRow[])
    .filter((row): row is SeenKanjiMeaningRow & { kanji: NonNullable<SeenKanjiMeaningRow["kanji"]> } =>
      row.kanji !== null && enabledLevels.includes(row.kanji.level as JlptLevel)
    )
    .map((row) => ({
      kind: "kanji_meaning" as const,
      id: row.kanji_id,
      kanjiChar: row.kanji.kanji,
      meanings: row.kanji.meanings ?? [],
    }));
}

interface SeenKanjiReadingRow {
  kanji_id: number;
  kanji_word_id: number;
  kanji: { kanji: string; meanings: string[] | null; level: string | null } | null;
  kanji_word: {
    vocabulary: {
      word: string;
      kana_reading: string | null;
      romaji_reading: string | null;
      other_readings: string[] | null;
      furiganas: string[] | null;
      primary_meanings: string[] | null;
      short_meaning: string | null;
      study_enabled: boolean;
    } | null;
  } | null;
}

/** Every kanji-in-a-word reading card this user has ever been introduced to (any non-suspended
 * status), scoped to the target kanji's enabled JLPT level(s) -- same reasoning/shape as
 * fetchSeenKanjiMeaning. Skips rows whose word has since been disabled (vocabulary.study_enabled
 * = false), matching get_due_cards. Doesn't attempt all_word_readings/known_kanji_chars (the
 * sibling-reading/sibling-kanji lookups get_due_cards does) -- ReviewCardKanjiReading and its
 * matching logic already treat those as optional, falling back to testing only this row's own
 * reading. */
export async function fetchSeenKanjiReading(
  supabase: AppSupabaseClient,
  userId: string,
  enabledLevels: readonly JlptLevel[]
): Promise<PracticeKanjiReadingCard[]> {
  const { data, error } = await supabase
    .from("user_kanji_reading_progress")
    .select(
      "kanji_id, kanji_word_id, kanji:kanji_id(kanji, meanings, level), kanji_word:kanji_word_id(vocabulary:id_word(word, kana_reading, romaji_reading, other_readings, furiganas, primary_meanings, short_meaning, study_enabled))"
    )
    .eq("user_id", userId)
    .neq("status", "suspended");
  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as SeenKanjiReadingRow[])
    .filter((row) => {
      const vocabulary = row.kanji_word?.vocabulary;
      return (
        row.kanji !== null &&
        vocabulary != null &&
        vocabulary.study_enabled &&
        enabledLevels.includes(row.kanji.level as JlptLevel)
      );
    })
    .map((row) => {
      const kanji = row.kanji!;
      const vocabulary = row.kanji_word!.vocabulary!;
      return {
        kind: "kanji_reading" as const,
        id: row.kanji_word_id,
        kanjiId: row.kanji_id,
        kanjiChar: kanji.kanji,
        kanjiMeanings: kanji.meanings ?? [],
        word: vocabulary.word,
        kanaReading: vocabulary.kana_reading,
        romajiReading: vocabulary.romaji_reading,
        otherReadings: vocabulary.other_readings,
        furiganas: vocabulary.furiganas,
        primaryWordMeanings: vocabulary.short_meaning
          ? [vocabulary.short_meaning, ...(vocabulary.primary_meanings ?? [])]
          : vocabulary.primary_meanings,
      };
    });
}
