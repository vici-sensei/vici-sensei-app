import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { KanjiDetailWord, NewKanjiIntroWord } from "@/lib/types";

type KanjiDetailWordRow = {
  kanji_word_id: number;
  reading_group: number | null;
  word: string;
  kana_reading: string | null;
  primary_meanings: string[] | null;
  other_meanings: string[][] | null;
  furiganas: string[] | null;
  jlpt_level: string | null;
  usually_kana?: boolean | null;
};

export async function fetchKanjiDetailWords(
  supabase: AppSupabaseClient,
  kanjiId: number
): Promise<{ words: KanjiDetailWord[]; error: string | null }> {
  const { data: wordRows, error } = await supabase.rpc("get_kanji_detail_words", {
    p_kanji_id: kanjiId,
  });

  if (error) return { words: [], error: error.message };

  const words = ((wordRows ?? []) as KanjiDetailWordRow[]).map((row) => ({
    id: row.kanji_word_id,
    reading_group: row.reading_group,
    vocabulary: {
      word: row.word,
      kana_reading: row.kana_reading,
      primary_meanings: row.primary_meanings,
      other_meanings: row.other_meanings,
      furiganas: row.furiganas,
      jlpt_level: row.jlpt_level,
      usually_kana: row.usually_kana,
    },
  }));

  return { words, error: null };
}

type KanjiIntroWordBatchRow = {
  kanji_id: number;
  kanji_word_id: number;
  word: string;
  primary_meanings: string[] | null;
  jlpt_level: string | null;
  usually_kana: boolean | null;
  furiganas: string[] | null;
};

/** kanji_word_id -> the JLPT level that unlocks it, for every word of `kanjiIds`' lists that is
 * locked for this student right now (get_kanji_word_locks). Words missing from the map aren't
 * locked. */
export async function fetchKanjiWordLocks(
  supabase: AppSupabaseClient,
  userId: string,
  kanjiIds: number[]
): Promise<{ locks: Map<number, string>; error: string | null }> {
  if (kanjiIds.length === 0) return { locks: new Map(), error: null };

  const { data, error } = await supabase.rpc("get_kanji_word_locks", { p_user_id: userId, p_kanji_ids: kanjiIds });
  if (error) return { locks: new Map(), error: error.message };

  const rows = (data ?? []) as { kanji_word_id: number; unlock_level: string }[];
  return { locks: new Map(rows.map((row) => [row.kanji_word_id, row.unlock_level])), error: null };
}

/** A kanji's word list with its locked words marked (unlock_level, looked up by kanji_word id) and
 * moved after the unlocked ones, each half keeping its own order. */
export function withWordLocks<W extends { id: number; unlock_level?: string | null }>(
  words: W[],
  unlockLevelOf: (kanjiWordId: number) => string | null | undefined
): W[] {
  const marked = words.map((word) => ({ ...word, unlock_level: unlockLevelOf(word.id) ?? null }));
  return [...marked.filter((word) => !word.unlock_level), ...marked.filter((word) => word.unlock_level)];
}

/** Batched version of fetchKanjiDetailWords — one RPC round trip for many kanji ids instead of one per id.
 * With `userId`, the words locked for that student are marked and listed last (see withWordLocks);
 * if only that lookup fails, the words still come back, unmarked. */
export async function fetchKanjiDetailWordsBatch(
  supabase: AppSupabaseClient,
  kanjiIds: number[],
  userId?: string
): Promise<{ wordsByKanjiId: Map<number, NewKanjiIntroWord[]>; error: string | null }> {
  if (kanjiIds.length === 0) return { wordsByKanjiId: new Map(), error: null };

  const [{ data: wordRows, error }, { locks }] = await Promise.all([
    supabase.rpc("get_kanji_detail_words_batch", { p_kanji_ids: kanjiIds }),
    userId ? fetchKanjiWordLocks(supabase, userId, kanjiIds) : Promise.resolve({ locks: new Map<number, string>() }),
  ]);

  if (error) return { wordsByKanjiId: new Map(), error: error.message };

  const wordsByKanjiId = new Map<number, NewKanjiIntroWord[]>();
  for (const row of (wordRows ?? []) as KanjiIntroWordBatchRow[]) {
    const word: NewKanjiIntroWord = {
      id: row.kanji_word_id,
      vocabulary: {
        word: row.word,
        primary_meanings: row.primary_meanings,
        jlpt_level: row.jlpt_level,
        usually_kana: row.usually_kana,
        furiganas: row.furiganas,
      },
    };
    const existing = wordsByKanjiId.get(row.kanji_id);
    if (existing) existing.push(word);
    else wordsByKanjiId.set(row.kanji_id, [word]);
  }
  for (const [kanjiId, words] of wordsByKanjiId) wordsByKanjiId.set(kanjiId, withWordLocks(words, (id) => locks.get(id)));

  return { wordsByKanjiId, error: null };
}
