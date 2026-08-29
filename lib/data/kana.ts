import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { BrowseKanaEntry, KanaRuleLabel } from "@/lib/types";

// Reference tables only -- under 200 characters total per set, so the whole thing loads once
// and Browse filters it locally instead of a server-side search RPC (see search_kanji /
// search_vocabulary for what that'd look like -- not worth it at this size).

const BROWSE_COLUMNS = "id, character, romaji, gojuon_row, kana_type, entry_kind, sound_origin, frequency_tier, notes";

export async function fetchAllHiragana(supabase: AppSupabaseClient): Promise<BrowseKanaEntry[]> {
  const { data, error } = await supabase.from("hiragana").select(BROWSE_COLUMNS).order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchAllKatakana(supabase: AppSupabaseClient): Promise<BrowseKanaEntry[]> {
  const { data, error } = await supabase.from("katakana").select(BROWSE_COLUMNS).order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchKanaRuleLabels(supabase: AppSupabaseClient): Promise<KanaRuleLabel[]> {
  const { data, error } = await supabase
    .from("kana_rule_labels")
    .select("kana_type, label, technical_term, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}
