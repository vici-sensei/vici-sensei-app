import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JmdictSense, JmdictSenseReviewRow } from "@/lib/types";

export async function fetchJmdictEntriesByIds(supabase: AppSupabaseClient, ids: number[]): Promise<JmdictSenseReviewRow[]> {
  const { data, error } = await supabase.from("jmdict_entries").select("id, word, kana_reading, senses").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as JmdictSenseReviewRow[];
}

interface JmdictEntryMeaningsRow {
  primary_meanings: string[] | null;
  other_meanings: string[][];
}

/**
 * Saves `senses` (the existing sync_jmdict_entries_primary_other_meanings trigger recomputes this
 * row's own primary_meanings/other_meanings from it), then copies those into every
 * public.vocabulary row this entry links to -- see 20261130_vocabulary_primary_other_meanings.sql
 * for why that copy lives here in application code instead of a DB trigger.
 */
export async function updateJmdictEntrySenses(supabase: AppSupabaseClient, id: number, senses: JmdictSense[]): Promise<void> {
  const { data, error } = await supabase.from("jmdict_entries").update({ senses }).eq("id", id).select("vocabulary_ids").single();
  if (error) throw new Error(error.message);

  const vocabularyIds = (data as { vocabulary_ids: number[] | null }).vocabulary_ids ?? [];
  await Promise.all(vocabularyIds.map((vocabularyId) => syncVocabularyMeanings(supabase, vocabularyId)));
}

/**
 * More than one jmdict_entries row can share a vocabulary id -- two distinct senses under one
 * reading, e.g. スイッチ covering both "switch (electrical)" and "(Nintendo) Switch" (see
 * 20261122_jmdict_entries_allow_shared_vocabulary_ids.sql). When that happens, this concatenates
 * every sibling row's primary_meanings/other_meanings (ordered by jmdict_entries.id) instead of
 * overwriting vocabulary with just the row that was saved, so the other sense's meanings aren't
 * clobbered. Mirrors the combine logic in 20261130_vocabulary_primary_other_meanings_backfill.sql.
 */
async function syncVocabularyMeanings(supabase: AppSupabaseClient, vocabularyId: number): Promise<void> {
  const { data: siblings, error: fetchError } = await supabase
    .from("jmdict_entries")
    .select("primary_meanings, other_meanings")
    .contains("vocabulary_ids", [vocabularyId])
    .order("id", { ascending: true });
  if (fetchError) throw new Error(fetchError.message);

  const rows = (siblings ?? []) as JmdictEntryMeaningsRow[];
  const primaryMeanings = rows.flatMap((row) => row.primary_meanings ?? []);
  const otherMeanings = rows.flatMap((row) => row.other_meanings ?? []);

  const { error: updateError } = await supabase
    .from("vocabulary")
    .update({ primary_meanings: primaryMeanings, other_meanings: otherMeanings })
    .eq("id", vocabularyId);
  if (updateError) throw new Error(updateError.message);
}
