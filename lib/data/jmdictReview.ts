import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { VocabularyMatchReviewRow } from "@/lib/types";

/** Unresolved rows, plus anything resolved in the last 7 days -- see
 * get_vocabulary_match_review_queue (20261120_jmdict_review_queue_includes_resolved.sql). */
export async function fetchVocabularyMatchReviewQueue(supabase: AppSupabaseClient): Promise<VocabularyMatchReviewRow[]> {
  const { data, error } = await supabase.rpc("get_vocabulary_match_review_queue");
  if (error) throw new Error(error.message);
  return (data ?? []) as VocabularyMatchReviewRow[];
}
