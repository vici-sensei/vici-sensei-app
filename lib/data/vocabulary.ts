import { createClient } from "@/lib/supabase/client";
import type { VocabularyDetailRow, VocabularyListResponse, VocabularyRow } from "@/lib/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface VocabularyListParams {
  search?: string | null;
  levels?: string[] | null;
  limit?: number;
  offset?: number;
}

/** Assumes levels have already been validated against JLPT_LEVELS by the caller. */
export async function fetchVocabularyList({
  search = null,
  levels = null,
  limit = DEFAULT_LIMIT,
  offset = 0,
}: VocabularyListParams): Promise<VocabularyListResponse> {
  const boundedLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const boundedOffset = Math.max(offset || 0, 0);

  const supabase = createClient();
  const { data, error } = await supabase.rpc("search_vocabulary", {
    p_query: search,
    p_level: levels,
    p_limit: boundedLimit,
    p_offset: boundedOffset,
  });

  if (error) throw new Error(error.message);

  const count = data[0]?.total_count ?? 0;
  const rows = (data as (VocabularyRow & { total_count: number })[]).map((row) => {
    const { total_count, ...rest } = row;
    void total_count;
    return rest;
  });

  return { data: rows, count, limit: boundedLimit, offset: boundedOffset };
}

export async function fetchVocabularyDetail(id: number): Promise<VocabularyDetailRow | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("vocabulary")
    .select("id, word, kana_reading, meanings, parts_of_speech, jlpt_level, other_readings")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
