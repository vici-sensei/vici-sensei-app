import { createClient } from "@/lib/supabase/client";
import { fetchStudyStats } from "@/lib/data/studyStats";
import { getActiveTimeZone } from "@/lib/timezone";
import type { StudyStats } from "@/lib/types";

export async function getStudyStats(userId: string): Promise<StudyStats> {
  const supabase = createClient();
  const timezone = getActiveTimeZone();
  // Fire-and-forget: persists the student's IANA timezone -- their "Custom timezone" pick if they
  // set one, otherwise the browser's -- so server-side triggers (leaderboard streak bumps) and any
  // study call that sends no timezone (an old cached client) can bucket days the same way this
  // poll's own RPCs do. No-ops server-side once synced (set_user_timezone skips the write when
  // unchanged, ignores a name Postgres doesn't know, and leaves a custom pick alone), so calling it
  // on every poll is cheap and self-heals if the user travels.
  //
  // The .then() is what actually sends it: a postgrest-js builder is lazy and only fires its
  // request once something subscribes, so a bare `void supabase.rpc(...)` never left the browser --
  // user_study_settings.timezone stayed NULL for everyone. Both outcomes are ignored (a failed
  // attempt is simply retried by the next poll).
  void supabase
    .rpc("set_user_timezone", { p_user_id: userId, p_timezone: timezone })
    .then(
      () => undefined,
      () => undefined
    );
  return fetchStudyStats(supabase, userId, timezone);
}
