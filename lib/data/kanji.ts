import { createClient } from "@/lib/supabase/client";
import type { KanjiDetail, KanjiListResponse, KanjiRow } from "@/lib/types";
import { fetchKanjiDetailWords } from "@/lib/kanji/detailWords";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface KanjiListParams {
  search?: string | null;
  levels?: string[] | null;
  limit?: number;
  offset?: number;
}

/** Assumes levels have already been validated against JLPT_LEVELS by the caller. */
export async function fetchKanjiList({
  search = null,
  levels = null,
  limit = DEFAULT_LIMIT,
  offset = 0,
}: KanjiListParams): Promise<KanjiListResponse> {
  const boundedLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const boundedOffset = Math.max(offset || 0, 0);

  const supabase = createClient();
  const { data, error } = await supabase.rpc("search_kanji", {
    p_query: search,
    p_level: levels,
    p_limit: boundedLimit,
    p_offset: boundedOffset,
  });

  if (error) throw new Error(error.message);

  const count = data[0]?.total_count ?? 0;
  const rows = (data as (KanjiRow & { total_count: number })[]).map((row) => {
    const { total_count, ...rest } = row;
    void total_count;
    return rest;
  });

  return { data: rows, count, limit: boundedLimit, offset: boundedOffset };
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
