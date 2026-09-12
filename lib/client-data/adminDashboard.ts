"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchAdminDashboardStats } from "@/lib/data/adminDashboard";
import { getErrorMessage } from "@/lib/api/client";
import type { AdminDashboardStats, AsyncStatus } from "@/lib/types";

export function useAdminDashboardStats(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const stats = await fetchAdminDashboardStats(createClient());
      setData(stats);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load dashboard stats."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}
