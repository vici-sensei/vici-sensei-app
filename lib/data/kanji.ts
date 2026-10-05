import { createClient } from "@/lib/supabase/client";
import type { KanjiDetail, KanjiInfo, KanjiListResponse, KanjiRow } from "@/lib/types";
import { fetchKanjiDetailWords } from "@/lib/kanji/detailWords";
import { fetchSearchableList, type SearchableListParams } from "@/lib/data/searchableList";

export type KanjiListParams = SearchableListParams;

/** Assumes levels have already been validated against BROWSE_LEVELS by the caller. */
export async function fetchKanjiList(params: KanjiListParams): Promise<KanjiListResponse> {
  return fetchSearchableList<KanjiRow & { total_count: number }>(createClient(), "search_kanji", params);
}

export async function fetchKanjiDetail(id: number): Promise<KanjiDetail | null> {
  const supabase = createClient();
  const { data: kanji, error: kanjiError } = await supabase.from("kanji").select("*").eq("id", id).maybeSingle();
  if (kanjiError) throw new Error(kanjiError.message);
  if (!kanji) return null;

  const { words, error: wordsError } = await fetchKanjiDetailWords(supabase, id);
  if (wordsError) throw new Error(wordsError);

  return { ...kanji, words };
}

// A kanji's meaning/level is the same for every user (and in both regions), so one lookup serves
// every card and page for the rest of the session -- the next card's kanji are usually already here.
const kanjiInfoCache = new Map<string, KanjiInfo>();
// Chars the kanji table has no row for (a non-JLPT kanji), remembered so they aren't asked again.
const kanjiInfoMisses = new Set<string>();

/** Id + meaning + level for every one of `chars` the kanji table has a row for (a char with no
 * row, e.g. a non-JLPT kanji, is simply absent). Only chars not seen before hit the network. */
export async function fetchKanjiInfoByCharacters(chars: string[]): Promise<KanjiInfo[]> {
  const unknown = chars.filter((char) => !kanjiInfoCache.has(char) && !kanjiInfoMisses.has(char));
  if (unknown.length > 0) {
    const { data, error } = await createClient().from("kanji").select("id, kanji, meanings, level").in("kanji", unknown);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as KanjiInfo[]) kanjiInfoCache.set(row.kanji, row);
    for (const char of unknown) if (!kanjiInfoCache.has(char)) kanjiInfoMisses.add(char);
  }
  return chars.flatMap((char) => kanjiInfoCache.get(char) ?? []);
}
