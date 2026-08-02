import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KanjiDetail, KanjiListResponse, KanjiRow } from "@/lib/types";
import { fetchKanjiDetailWords } from "@/lib/kanji/detailWords";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
// Kanji reference data (dictionary content, not user data) is shared across every user — the
// RLS policy on these tables just requires "authenticated", nothing user-scoped — and it's
// effectively static, so it's cached at the Next.js data layer instead of hitting Supabase on
// every browse/search. Given the DB's current cross-region latency, this is the single highest
// cache-hit-rate win available: same query args from any user land on the same cache entry.
const REVALIDATE_SECONDS = 3600;

export interface KanjiListParams {
  search?: string | null;
  levels?: string[] | null;
  limit?: number;
  offset?: number;
}

async function queryKanjiList(
  search: string | null,
  levels: string[] | null,
  limit: number,
  offset: number
): Promise<KanjiListResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("search_kanji", {
    p_query: search,
    p_level: levels,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw new Error(error.message);

  const count = data[0]?.total_count ?? 0;
  const rows = (data as (KanjiRow & { total_count: number })[]).map((row) => {
    const { total_count, ...rest } = row;
    void total_count;
    return rest;
  });

  return { data: rows, count, limit, offset };
}

const cachedQueryKanjiList = unstable_cache(queryKanjiList, ["kanji-list"], { revalidate: REVALIDATE_SECONDS });

/** Assumes levels have already been validated against JLPT_LEVELS by the caller (route params or page-constructed values). */
export async function fetchKanjiList({
  search = null,
  levels = null,
  limit = DEFAULT_LIMIT,
  offset = 0,
}: KanjiListParams): Promise<KanjiListResponse> {
  const boundedLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const boundedOffset = Math.max(offset || 0, 0);
  return cachedQueryKanjiList(search, levels, boundedLimit, boundedOffset);
}

async function queryKanjiDetail(id: number): Promise<KanjiDetail | null> {
  const supabase = createAdminClient();
  const { data: kanji, error: kanjiError } = await supabase.from("kanji").select("*").eq("id", id).maybeSingle();
  if (kanjiError) throw new Error(kanjiError.message);
  if (!kanji) return null;

  const { words, error: wordsError } = await fetchKanjiDetailWords(supabase, id);
  if (wordsError) throw new Error(wordsError);

  return { ...kanji, words };
}

const cachedQueryKanjiDetail = unstable_cache(queryKanjiDetail, ["kanji-detail"], { revalidate: REVALIDATE_SECONDS });

export async function fetchKanjiDetail(id: number): Promise<KanjiDetail | null> {
  return cachedQueryKanjiDetail(id);
}
