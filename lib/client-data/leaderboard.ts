"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchLeaderboard } from "@/lib/data/leaderboard";
import { getPeriodStart } from "@/lib/leaderboard/period";
import { readStoredMetric, readStoredPeriod } from "@/lib/leaderboard/storage";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

type Status = "loading" | "loaded" | "error";

function leaderboardCacheKey(metric: LeaderboardMetric, period: LeaderboardPeriod): string {
  return `cache:leaderboard:${metric}:${period}`;
}

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
      writeCache(leaderboardCacheKey(metric, period), result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard.");
      setStatus("error");
    }
  }, [user, metric, period, clockOffsetMs]);

  useEffect(() => {
    if (user) {
      // Instant paint from a hover/focus/touchstart prefetch of the Leaderboard nav entry
      // (or a previous visit to this exact metric/period tab) -- purely provisional,
      // refetch() right below always runs and overwrites it once the real fetch resolves.
      const cached = readCache<LeaderboardEntry[]>(leaderboardCacheKey(metric, period));
      if (cached) {
        setData(cached);
        setStatus("loaded");
      }
    }
    void refetch();
  }, [refetch, user, metric, period]);

  return { data, status, error, refetch };
}

/** Fire-and-forget: called on hover/focus/touchstart of the Leaderboard nav entry point, well
 * before the user actually navigates to /leaderboard. Targets whatever metric/period the page
 * will actually initialize with (same stored/fallback values as readStoredMetric/readStoredPeriod
 * on the page itself). */
export const prefetchLeaderboard = createPrefetcher(async (userId: string) => {
  const metric = readStoredMetric("new_cards");
  const period = readStoredPeriod("weekly");
  const periodStart = metric === "streak" ? null : getPeriodStart(period, new Date());
  const result = await fetchLeaderboard(createClient(), metric, periodStart, userId);
  writeCache(leaderboardCacheKey(metric, period), result);
});
