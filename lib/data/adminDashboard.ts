import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { AdminDashboardStats } from "@/lib/types";

export async function fetchAdminDashboardStats(supabase: AppSupabaseClient): Promise<AdminDashboardStats> {
  const { data, error } = await supabase.rpc("get_admin_dashboard_stats").single();

  if (error) throw new Error(error.message);
  return data as AdminDashboardStats;
}
