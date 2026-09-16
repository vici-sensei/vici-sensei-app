import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { VocabularyShortMeaningRow } from "@/lib/types";

export async function fetchVocabularyShortMeanings(supabase: AppSupabaseClient): Promise<VocabularyShortMeaningRow[]> {
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id, word, kana_reading, primary_meanings, short_meaning")
    .not("short_meaning", "is", null)
    .order("word");

  if (error) throw new Error(error.message);
  return data;
}
