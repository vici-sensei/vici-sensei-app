import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { KanjiDetailWord, NewKanjiIntroWord } from "@/lib/types";

type KanjiDetailWordRow = {
  kanji_word_id: number;
  reading_group: number | null;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  furiganas: string[] | null;
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
      meanings: row.meanings,
      furiganas: row.furiganas,
    },
  }));

  return { words, error: null };
}

type KanjiIntroWordBatchRow = {
  kanji_id: number;
  kanji_word_id: number;
  word: string;
  meanings: string[] | null;
  jlpt_level: string | null;
  usually_kana: boolean | null;
  furiganas: string[] | null;
};

/** Batched version of fetchKanjiDetailWords — one RPC round trip for many kanji ids instead of one per id. */
export async function fetchKanjiDetailWordsBatch(
  supabase: AppSupabaseClient,
  kanjiIds: number[]
): Promise<{ wordsByKanjiId: Map<number, NewKanjiIntroWord[]>; error: string | null }> {
  if (kanjiIds.length === 0) return { wordsByKanjiId: new Map(), error: null };

  const { data: wordRows, error } = await supabase.rpc("get_kanji_detail_words_batch", {
    p_kanji_ids: kanjiIds,
  });

  if (error) return { wordsByKanjiId: new Map(), error: error.message };

  const wordsByKanjiId = new Map<number, NewKanjiIntroWord[]>();
  for (const row of (wordRows ?? []) as KanjiIntroWordBatchRow[]) {
    const word: NewKanjiIntroWord = {
      id: row.kanji_word_id,
      vocabulary: {
        word: row.word,
        meanings: row.meanings,
        jlpt_level: row.jlpt_level,
        usually_kana: row.usually_kana,
        furiganas: row.furiganas,
      },
    };
    const existing = wordsByKanjiId.get(row.kanji_id);
    if (existing) existing.push(word);
    else wordsByKanjiId.set(row.kanji_id, [word]);
  }

  return { wordsByKanjiId, error: null };
}
