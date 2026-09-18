import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { BrowseKanaEntry, KanaExtendedRomaji, KanaRuleLabel } from "@/lib/types";

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

type ExtendedRomajiRow = {
  id: number;
  character: string;
  romaji: string;
  entry_kind: string;
  extended_romaji: string[] | null;
};

const EXTENDED_ROMAJI_COLUMNS = "id, character, romaji, entry_kind, extended_romaji";

function indexExtendedRomaji(rows: ExtendedRomajiRow[] | null): {
  byId: Record<number, string[]>;
  units: Record<string, string[]>;
} {
  const byId: Record<number, string[]> = {};
  const units: Record<string, string[]> = {};
  for (const row of rows ?? []) {
    if (row.extended_romaji && row.extended_romaji.length > 0) byId[row.id] = row.extended_romaji;
    // Rule rows are explanatory labels (their `character` collides with a real kana, e.g. the
    // "hiragana" rule row sits on あ), not readings.
    if (row.entry_kind !== "rule") units[row.character] = [row.romaji, ...(row.extended_romaji ?? [])];
  }
  return { byId, units };
}

/** Every kana row's romaji + extended_romaji for both scripts (a few KB in total) -- what the
 * "Extended romaji" setting needs to widen a typed answer beyond its single canonical romaji.
 * Rows with an empty array are left out of `hiragana`/`katakana`, so a lookup miss and an empty
 * list mean the same thing. */
export async function fetchKanaExtendedRomaji(supabase: AppSupabaseClient): Promise<KanaExtendedRomaji> {
  const [hiragana, katakana] = await Promise.all([
    supabase.from("hiragana").select(EXTENDED_ROMAJI_COLUMNS),
    supabase.from("katakana").select(EXTENDED_ROMAJI_COLUMNS),
  ]);
  if (hiragana.error) throw new Error(hiragana.error.message);
  if (katakana.error) throw new Error(katakana.error.message);
  const h = indexExtendedRomaji(hiragana.data as ExtendedRomajiRow[] | null);
  const k = indexExtendedRomaji(katakana.data as ExtendedRomajiRow[] | null);
  return {
    hiragana: h.byId,
    katakana: k.byId,
    units: { hiragana: h.units, katakana: k.units },
  };
}

export async function fetchKanaRuleLabels(supabase: AppSupabaseClient): Promise<KanaRuleLabel[]> {
  const { data, error } = await supabase
    .from("kana_rule_labels")
    .select("kana_type, label, technical_term, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}
