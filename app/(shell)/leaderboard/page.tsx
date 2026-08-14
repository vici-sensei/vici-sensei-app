"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeaderboard } from "@/lib/client-data/leaderboard";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";
import { LeaderboardTabs } from "./LeaderboardTabs";
import { LeaderboardPeriodSelector } from "./LeaderboardPeriodSelector";
import { LeaderboardCountdown } from "./LeaderboardCountdown";
import { LeaderboardList } from "./LeaderboardList";

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [metric, setMetric] = useState<LeaderboardMetric>("xp");
  const [period, setPeriod] = useState<LeaderboardPeriod>("weekly");
  const clockOffsetMs = useServerClockOffset();
  const { data, status } = useLeaderboard(user, metric, period, clockOffsetMs);

  return (
    <div>
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Leaderboard</h1>
      <p className="mb-7.5 text-base leading-[1.6] text-text-muted">
        See how you stack up against other students.
      </p>

      <LeaderboardTabs active={metric} onChange={setMetric} />
      {metric === "streak" ? (
        <p className="mb-5.5 text-sm text-text-muted">Current streak — this one doesn&apos;t reset by period.</p>
      ) : (
        <>
          <LeaderboardPeriodSelector active={period} onChange={setPeriod} />
          <LeaderboardCountdown period={period} clockOffsetMs={clockOffsetMs} />
        </>
      )}
      <LeaderboardList entries={data} status={status} metric={metric} viewerId={user?.id} />
    </div>
  );
}
