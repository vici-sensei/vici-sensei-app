import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { VocabularyShortMeaningRow } from "@/lib/types";

export async function fetchVocabularyShortMeanings(supabase: AppSupabaseClient): Promise<VocabularyShortMeaningRow[]> {
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id, word, kana_reading, primary_meanings, short_meaning, jlpt_level")
    .not("short_meaning", "is", null)
    .eq("study_enabled", true)
    .not("jlpt_level", "is", null)
    .order("frequency_number", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
