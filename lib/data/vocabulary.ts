import { createClient } from "@/lib/supabase/client";
import type { VocabularyDetailRow, VocabularyListResponse, VocabularyRow } from "@/lib/types";
import { fetchSearchableList, type SearchableListParams } from "@/lib/data/searchableList";

export type VocabularyListParams = SearchableListParams;

/** Assumes levels have already been validated against JLPT_LEVELS by the caller. */
export async function fetchVocabularyList(params: VocabularyListParams): Promise<VocabularyListResponse> {
  return fetchSearchableList<VocabularyRow & { total_count: number }>(createClient(), "search_vocabulary", params);
}

export async function fetchVocabularyDetail(id: number): Promise<VocabularyDetailRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id, word, kana_reading, meanings, parts_of_speech, jlpt_level, other_readings, furiganas")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
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
