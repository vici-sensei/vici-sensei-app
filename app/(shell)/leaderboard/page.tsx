"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeaderboard } from "@/lib/client-data/leaderboard";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { useStudySettings } from "@/lib/client-data/studySettings";
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
  const { data, status } = useLeaderboard(user, metric, period);
  const { data: studySettings } = useStudySettings(user);

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
      {metric === "streak" ? null : (
        <>
          <LeaderboardPeriodSelector active={period} onChange={handlePeriodChange} />
          <LeaderboardCountdown period={period} clockOffsetMs={clockOffsetMs} />
        </>
      )}
      {metric === "xp" ? (
        <p className="mb-5.5 text-sm text-text-muted">Earn 10 XP for every correct review, 2 XP even if you miss one, and 25 XP for each new card you start.</p>
      ) : null}
      <LeaderboardList
        entries={data}
        status={status}
        metric={metric}
        viewerId={user?.id}
        viewerAnonymous={studySettings?.leaderboard_anonymous ?? false}
      />
    </div>
  );
}
