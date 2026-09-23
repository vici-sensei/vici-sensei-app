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

type KanjiInfoRow = Pick<KanjiRow, "kanji" | "meanings" | "level"> & {
  user_kanji_meaning_progress: { status: string }[];
};

/** Meaning + level for every one of `chars` the kanji table has a row for (a char with no row,
 * e.g. a non-JLPT kanji, is simply absent), plus whether `userId` has already learned its meaning
 * -- review/relearning, the same bar as get_level_progress's "Already learned". The embedded
 * progress rows are filtered to `userId` explicitly: RLS alone would also hand an admin every
 * other student's row. */
export async function fetchKanjiInfoByCharacters(userId: string, chars: string[]): Promise<KanjiInfo[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("kanji")
    .select("kanji, meanings, level, user_kanji_meaning_progress(status)")
    .in("kanji", chars)
    .eq("user_kanji_meaning_progress.user_id", userId)
    .in("user_kanji_meaning_progress.status", ["review", "relearning"]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as KanjiInfoRow[]).map(({ user_kanji_meaning_progress, ...kanji }) => ({
    ...kanji,
    meaning_learned: user_kanji_meaning_progress.length > 0,
  }));
}
