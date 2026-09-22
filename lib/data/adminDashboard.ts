import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import type { AdminDashboardStats } from "@/lib/types";

/**
 * admin_get_dashboard_stats (multi-region Phase 6) is the same as get_admin_dashboard_stats,
 * reading student counts from admin_all.* (local + mirrored US students) instead of public.*
 * alone -- see the comment on fetchStudentRoster (lib/data/adminStudents.ts) for why this needed
 * a new SECURITY DEFINER function, and for why calling it has to stay behind the same
 * NEXT_PUBLIC_MULTI_REGION flag createClient() does (it only exists on the new EU/US projects).
 * Leads aren't mirrored (the marketing site's lead capture isn't region-split), so those two
 * columns are unchanged either way.
 */
export async function fetchAdminDashboardStats(supabase: AppSupabaseClient): Promise<AdminDashboardStats> {
  const { data, error } = await supabase.rpc(isMultiRegionEnabled() ? "admin_get_dashboard_stats" : "get_admin_dashboard_stats").single();

  if (error) throw new Error(error.message);
  return data as AdminDashboardStats;
}
