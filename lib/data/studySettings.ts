import { cache } from "react";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { StudySettings } from "@/lib/types";

export async function fetchStudySettings(
  supabase: SupabaseServerClient,
  userId: string
): Promise<StudySettings | null> {
  const { data, error } = await supabase
    .from("user_study_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/** Cached per-request so every layout/page that needs settings shares one query. */
export const getStudySettings = cache(fetchStudySettings);
