import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { StudentRosterRow } from "@/lib/types";

/** get_admin_student_roster (20261236_backfill_graduated_at_and_admin_roster_rpc.sql; test_count
 *  moved onto leaderboard_stats itself by 20261237_test_count_on_leaderboard_stats.sql) folds
 *  every lifetime activity total -- reviews, new cards, kana drill graduations, free practice,
 *  reading test answers -- into one row per student, replacing the old plain
 *  users+leaderboard_stats embed. */
export async function fetchStudentRoster(supabase: AppSupabaseClient): Promise<StudentRosterRow[]> {
  const { data, error } = await supabase.rpc("get_admin_student_roster");

  if (error) throw new Error(error.message);

  // Most-quiet-first (never-active sorts as "" which precedes any ISO date) -- that's who the
  // teacher actually needs to see.
  return (data as StudentRosterRow[]).sort((a, b) => (a.last_active_date ?? "").localeCompare(b.last_active_date ?? ""));
}
