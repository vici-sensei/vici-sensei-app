import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { KanjiDetailWord } from "@/lib/types";

type KanjiDetailWordRow = {
  kanji_word_id: number;
  reading_number: number | null;
  word_id: number;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  parts_of_speech: string[] | null;
  ids_kanji: number[] | null;
  jlpt_level: string | null;
  is_common_jisho: boolean | null;
  usually_kana: boolean | null;
  frequency: string | null;
  romaji_reading: string | null;
  furiganas: string[] | null;
  romaji_furiganas: string[] | null;
  other_readings: string[] | null;
};

export async function fetchKanjiDetailWords(
  supabase: SupabaseServerClient,
  kanjiId: number
): Promise<{ words: KanjiDetailWord[]; error: string | null }> {
  const { data: wordRows, error } = await supabase.rpc("get_kanji_detail_words", {
    p_kanji_id: kanjiId,
  });

  if (error) return { words: [], error: error.message };

  const words = ((wordRows ?? []) as KanjiDetailWordRow[]).map((row) => ({
    id: row.kanji_word_id,
    reading_number: row.reading_number,
    vocabulary: {
      id: row.word_id,
      word: row.word,
      kana_reading: row.kana_reading,
      meanings: row.meanings,
      parts_of_speech: row.parts_of_speech,
      ids_kanji: row.ids_kanji,
      jlpt_level: row.jlpt_level,
      is_common_jisho: row.is_common_jisho,
      usually_kana: row.usually_kana,
      frequency: row.frequency,
      romaji_reading: row.romaji_reading,
      furiganas: row.furiganas,
      romaji_furiganas: row.romaji_furiganas,
      other_readings: row.other_readings,
    },
  }));

  return { words, error: null };
}

type KanjiDetailWordBatchRow = KanjiDetailWordRow & { kanji_id: number };

/** Batched version of fetchKanjiDetailWords — one RPC round trip for many kanji ids instead of one per id. */
export async function fetchKanjiDetailWordsBatch(
  supabase: SupabaseServerClient,
  kanjiIds: number[]
): Promise<{ wordsByKanjiId: Map<number, KanjiDetailWord[]>; error: string | null }> {
  if (kanjiIds.length === 0) return { wordsByKanjiId: new Map(), error: null };

  const { data: wordRows, error } = await supabase.rpc("get_kanji_detail_words_batch", {
    p_kanji_ids: kanjiIds,
  });

  if (error) return { wordsByKanjiId: new Map(), error: error.message };

  const wordsByKanjiId = new Map<number, KanjiDetailWord[]>();
  for (const row of (wordRows ?? []) as KanjiDetailWordBatchRow[]) {
    const word: KanjiDetailWord = {
      id: row.kanji_word_id,
      reading_number: row.reading_number,
      vocabulary: {
        id: row.word_id,
        word: row.word,
        kana_reading: row.kana_reading,
        meanings: row.meanings,
        parts_of_speech: row.parts_of_speech,
        ids_kanji: row.ids_kanji,
        jlpt_level: row.jlpt_level,
        is_common_jisho: row.is_common_jisho,
        usually_kana: row.usually_kana,
        frequency: row.frequency,
        romaji_reading: row.romaji_reading,
        furiganas: row.furiganas,
        romaji_furiganas: row.romaji_furiganas,
        other_readings: row.other_readings,
      },
    };
    const existing = wordsByKanjiId.get(row.kanji_id);
    if (existing) existing.push(word);
    else wordsByKanjiId.set(row.kanji_id, [word]);
  }

  return { wordsByKanjiId, error: null };
}
