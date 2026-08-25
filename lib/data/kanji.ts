import { createClient } from "@/lib/supabase/client";
import type { KanjiDetail, KanjiListResponse, KanjiRow } from "@/lib/types";
import { fetchKanjiDetailWords } from "@/lib/kanji/detailWords";
import { fetchSearchableList, type SearchableListParams } from "@/lib/data/searchableList";

export type KanjiListParams = SearchableListParams;

/** Assumes levels have already been validated against JLPT_LEVELS by the caller. */
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
