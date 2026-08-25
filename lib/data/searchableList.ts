import type { AppSupabaseClient } from "@/lib/supabase/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export interface SearchableListParams {
  search?: string | null;
  levels?: string[] | null;
  limit?: number;
  offset?: number;
}

export interface SearchableListResponse<T> {
  data: T[];
  count: number;
  limit: number;
  offset: number;
}

/** Shared by fetchKanjiList/fetchVocabularyList: bounds limit/offset, calls a paginated search RPC
 * (search_kanji/search_vocabulary) that returns each row plus a `total_count` column, and strips
 * that column back off. Assumes levels have already been validated against JLPT_LEVELS by the caller. */
export async function fetchSearchableList<T extends { total_count: number }>(
  supabase: AppSupabaseClient,
  rpcName: string,
  { search = null, levels = null, limit = DEFAULT_LIMIT, offset = 0 }: SearchableListParams
): Promise<SearchableListResponse<Omit<T, "total_count">>> {
  const boundedLimit = Math.min(limit || DEFAULT_LIMIT, MAX_LIMIT);
  const boundedOffset = Math.max(offset || 0, 0);

  const { data, error } = await supabase.rpc(rpcName, {
    p_query: search,
    p_level: levels,
    p_limit: boundedLimit,
    p_offset: boundedOffset,
  });

  if (error) throw new Error(error.message);

  const count = data[0]?.total_count ?? 0;
  const rows = (data as T[]).map((row) => {
    const { total_count, ...rest } = row;
    void total_count;
    return rest;
  });

  return { data: rows, count, limit: boundedLimit, offset: boundedOffset };
}
