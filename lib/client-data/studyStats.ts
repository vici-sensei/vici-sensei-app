import { createClient } from "@/lib/supabase/client";
import { fetchStudyStats } from "@/lib/data/studyStats";
import type { StudyStats } from "@/lib/types";

export async function getStudyStats(userId: string): Promise<StudyStats> {
  const supabase = createClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fetchStudyStats(supabase, userId, timezone);
}
