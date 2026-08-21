import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { NewHiraganaCandidate, NewKatakanaCandidate } from "@/lib/types";

// Reference tables only -- under 110 characters total per set, so the whole thing loads once
// and Browse filters it locally instead of a server-side search RPC (see search_kanji /
// search_vocabulary for what that'd look like -- not worth it at this size).

export async function fetchAllHiragana(supabase: AppSupabaseClient): Promise<NewHiraganaCandidate[]> {
  const { data, error } = await supabase.from("hiragana").select("id, character, romaji, gojuon_row").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAllKatakana(supabase: AppSupabaseClient): Promise<NewKatakanaCandidate[]> {
  const { data, error } = await supabase.from("katakana").select("id, character, romaji, gojuon_row").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}
