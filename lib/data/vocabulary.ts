import { createClient } from "@/lib/supabase/client";
import type { VocabularyDetailRow, VocabularyListResponse, VocabularyRow } from "@/lib/types";
import { fetchSearchableList, type SearchableListParams } from "@/lib/data/searchableList";

export type VocabularyListParams = SearchableListParams;

/** Assumes levels have already been validated against BROWSE_LEVELS by the caller. */
export async function fetchVocabularyList(params: VocabularyListParams): Promise<VocabularyListResponse> {
  return fetchSearchableList<VocabularyRow & { total_count: number }>(createClient(), "search_vocabulary", params);
}

export async function fetchVocabularyDetail(id: number): Promise<VocabularyDetailRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id, word, kana_reading, primary_meanings, other_meanings, parts_of_speech, jlpt_level, other_readings, furiganas, usually_kana, short_meaning")
    .eq("id", id)
    .eq("study_enabled", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { short_meaning, ...row } = data;
  return { ...row, primary_meanings: short_meaning ? [short_meaning, ...(row.primary_meanings ?? [])] : row.primary_meanings };
}

/**
 * A study card's word's other_meanings (see VocabularyRow.other_meanings) -- none of the card RPCs
 * carry them, since they only ever sit behind the revealed card's "Show other meanings" toggle. A
 * vocab_meaning card knows its word by word_id, a kanji_reading card only by kanji_word_id.
 */
export async function fetchStudyWordOtherMeanings(
  ref: { wordId: number } | { kanjiWordId: number }
): Promise<string[][] | null> {
  const supabase = createClient();
  if ("wordId" in ref) {
    const { data, error } = await supabase.from("vocabulary").select("other_meanings").eq("id", ref.wordId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.other_meanings as string[][] | null | undefined) ?? null;
  }
  const { data, error } = await supabase
    .from("kanji_word")
    .select("vocabulary:id_word(other_meanings)")
    .eq("id", ref.kanjiWordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as unknown as { vocabulary: { other_meanings: string[][] | null } | null } | null;
  return row?.vocabulary?.other_meanings ?? null;
}

/**
 * get_due_cards.all_word_readings flattens every sibling row's kana_reading and
 * romaji_reading into one undifferentiated list, so it can't say which romaji
 * belongs to which kana. Querying vocabulary directly keeps each row's own pair
 * intact, so a typed romaji sibling reading can be shown in its real kana form.
 */
export async function fetchSiblingReadingPairs(word: string): Promise<{ kanaReading: string | null; romajiReading: string | null }[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("vocabulary").select("kana_reading, romaji_reading").eq("word", word);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ kanaReading: row.kana_reading, romajiReading: row.romaji_reading }));
}
