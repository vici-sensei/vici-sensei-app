"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchLeaderboard } from "@/lib/data/leaderboard";
import { getPeriodStart } from "@/lib/leaderboard/period";
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

type Status = "loading" | "loaded" | "error";

/** `clockOffsetMs` corrects for a wrong local clock -- see useServerClockOffset. */
export function useLeaderboard(
  user: User | null,
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
  clockOffsetMs = 0
) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const periodStart = metric === "streak" ? null : getPeriodStart(period, new Date(Date.now() + clockOffsetMs));
      const result = await fetchLeaderboard(createClient(), metric, periodStart, user.id);
      setData(result);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard.");
      setStatus("error");
    }
  }, [user, metric, period, clockOffsetMs]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}
