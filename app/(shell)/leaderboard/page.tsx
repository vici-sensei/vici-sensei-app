"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeaderboard } from "@/lib/client-data/leaderboard";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";
import { readStoredMetric, readStoredPeriod, writeStoredMetric, writeStoredPeriod } from "@/lib/leaderboard/storage";
import { LeaderboardTabs } from "./LeaderboardTabs";
import { LeaderboardPeriodSelector } from "./LeaderboardPeriodSelector";
import { LeaderboardCountdown } from "./LeaderboardCountdown";
import { LeaderboardList } from "./LeaderboardList";

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [metric, setMetric] = useState<LeaderboardMetric>(() => readStoredMetric("new_cards"));
  const [period, setPeriod] = useState<LeaderboardPeriod>(() => readStoredPeriod("weekly"));
  const clockOffsetMs = useServerClockOffset();
  const { data, status } = useLeaderboard(user, metric, period, clockOffsetMs);

  function handleMetricChange(next: LeaderboardMetric) {
    setMetric(next);
    writeStoredMetric(next);
  }

  function handlePeriodChange(next: LeaderboardPeriod) {
    setPeriod(next);
    writeStoredPeriod(next);
  }

  return (
    <div>
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Leaderboard</h1>
      <p className="mb-7.5 text-base leading-[1.6] text-text-muted  text-center md:text-left">
        See how you stack up against other students.
      </p>

      <LeaderboardTabs active={metric} onChange={handleMetricChange} />
      {metric === "streak" ? (
        <p className="mb-5.5 text-sm text-text-muted">Current streak — this one doesn&apos;t reset by period.</p>
      ) : (
        <>
          <LeaderboardPeriodSelector active={period} onChange={handlePeriodChange} />
          <LeaderboardCountdown period={period} clockOffsetMs={clockOffsetMs} />
        </>
      )}
      <LeaderboardList entries={data} status={status} metric={metric} viewerId={user?.id} />
    </div>
  );
}
