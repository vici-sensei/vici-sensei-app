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

/** Meaning + level for every one of `chars` the kanji table has a row for -- a char with no row
 * (e.g. a non-JLPT kanji) is simply absent from the result. */
export async function fetchKanjiInfoByCharacters(chars: string[]): Promise<KanjiInfo[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("kanji").select("kanji, meanings, level").in("kanji", chars);
  if (error) throw new Error(error.message);
  return (data ?? []) as KanjiInfo[];
}
