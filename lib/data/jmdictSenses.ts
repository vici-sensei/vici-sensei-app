import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JmdictSense, JmdictSenseReviewRow } from "@/lib/types";

export async function fetchJmdictEntriesByIds(supabase: AppSupabaseClient, ids: number[]): Promise<JmdictSenseReviewRow[]> {
  const { data, error } = await supabase.from("jmdict_entries").select("id, word, kana_reading, senses").in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as JmdictSenseReviewRow[];
}

export async function updateJmdictEntrySenses(supabase: AppSupabaseClient, id: number, senses: JmdictSense[]): Promise<void> {
  const { error } = await supabase.from("jmdict_entries").update({ senses }).eq("id", id);
  if (error) throw new Error(error.message);
}
