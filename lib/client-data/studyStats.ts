import { createClient } from "@/lib/supabase/client";
import { fetchStudyStats } from "@/lib/data/studyStats";
import type { StudyStats } from "@/lib/types";

export async function getStudyStats(userId: string): Promise<StudyStats> {
  const supabase = createClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Fire-and-forget: persists the browser's IANA timezone so server-side triggers (leaderboard
  // streak bumps) can bucket days the same way this poll's own RPCs do. No-ops server-side once
  // synced (set_user_timezone skips the write when unchanged), so calling it on every poll is
  // cheap and self-heals if the user travels.
  void supabase.rpc("set_user_timezone", { p_user_id: userId, p_timezone: timezone });
  return fetchStudyStats(supabase, userId, timezone);
}
