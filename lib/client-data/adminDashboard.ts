"use client";

import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchAdminDashboardStats } from "@/lib/data/adminDashboard";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

export function useAdminDashboardStats(user: User | null) {
  return useRemoteData({
    params: user?.id ?? null,
    load: () => fetchAdminDashboardStats(createClient()),
    errorFallback: "Failed to load dashboard stats.",
  });
}
