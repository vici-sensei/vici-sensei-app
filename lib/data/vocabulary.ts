import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VocabularyDetailRow, VocabularyListResponse, VocabularyRow } from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
// See lib/data/kanji.ts — vocabulary is the same kind of shared, effectively-static reference
// data, so it's cached the same way.
const REVALIDATE_SECONDS = 3600;

export interface VocabularyListParams {
  search?: string | null;
  levels?: string[] | null;
  limit?: number;
  offset?: number;
}

async function queryVocabularyList(
  search: string | null,
  levels: string[] | null,
  limit: number,
  offset: number
): Promise<VocabularyListResponse> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("search_vocabulary", {
    p_query: search,
    p_level: levels,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw new Error(error.message);

  const count = data[0]?.total_count ?? 0;
  const rows = (data as (VocabularyRow & { total_count: number })[]).map((row) => {
    const { total_count, ...rest } = row;
    void total_count;
    return rest;
  });

  return { data: rows, count, limit, offset };
}

const cachedQueryVocabularyList = unstable_cache(queryVocabularyList, ["vocabulary-list"], {
  revalidate: REVALIDATE_SECONDS,
});

/** Assumes levels have already been validated against JLPT_LEVELS by the caller (route params or page-constructed values). */
export async function fetchVocabularyList({
  search = null,
  levels = null,
  limit = DEFAULT_LIMIT,
  offset = 0,
}: VocabularyListParams): Promise<VocabularyListResponse> {
  const boundedLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const boundedOffset = Math.max(offset || 0, 0);
  return cachedQueryVocabularyList(search, levels, boundedLimit, boundedOffset);
}

async function queryVocabularyDetail(id: number): Promise<VocabularyDetailRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id, word, kana_reading, meanings, parts_of_speech, jlpt_level, other_readings")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const cachedQueryVocabularyDetail = unstable_cache(queryVocabularyDetail, ["vocabulary-detail"], {
  revalidate: REVALIDATE_SECONDS,
});

export async function fetchVocabularyDetail(id: number): Promise<VocabularyDetailRow | null> {
  return cachedQueryVocabularyDetail(id);
}
