import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import type { StudentRosterRow } from "@/lib/types";

/**
 * admin_get_student_roster (multi-region Phase 6) is the same shape and logic as the original
 * get_admin_student_roster (20261236/20261237), but reads from admin_all.* -- a per-table UNION
 * ALL of public.* (this project's own students) and mirror_us.* (a one-way logical-replication
 * copy of the US project's students, since the admin account only exists in EU). A SECURITY
 * DEFINER function with its own is_admin() check, not RLS -- mirror_us has no RLS policies at
 * all, so a plain (non-definer) function relying on RLS the way the original does would have let
 * any authenticated caller read a mirrored student's real data by guessing their id.
 *
 * It only exists on the new EU/US projects, not the still-live old one this app talks to while
 * NEXT_PUBLIC_MULTI_REGION is off -- so which RPC to call has to follow the same flag `createClient()`
 * already branches on, or this would 404 in production today.
 */
export async function fetchStudentRoster(supabase: AppSupabaseClient): Promise<StudentRosterRow[]> {
  const { data, error } = await supabase.rpc(isMultiRegionEnabled() ? "admin_get_student_roster" : "get_admin_student_roster");

  if (error) throw new Error(error.message);

  // Most-quiet-first (never-active sorts as "" which precedes any ISO date) -- that's who the
  // teacher actually needs to see.
  return (data as StudentRosterRow[]).sort((a, b) => (a.last_active_date ?? "").localeCompare(b.last_active_date ?? ""));
}
