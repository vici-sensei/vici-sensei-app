"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useLeaderboard } from "@/lib/client-data/leaderboard";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { PageHeader } from "@/app/components/ui/PageHeader";
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
  const { data: studySettings } = useStudySettingsContext();

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
      <PageHeader title="Leaderboard" subtitle="See how you stack up against other students." />

      <div className="w-fit mx-auto md:mx-0">
        <LeaderboardTabs active={metric} onChange={handleMetricChange} />
      </div>
      {metric === "streak" ? null : (
        <>
          <LeaderboardPeriodSelector active={period} onChange={handlePeriodChange} />
          <LeaderboardCountdown period={period} clockOffsetMs={clockOffsetMs} />
        </>
      )}
      {metric === "xp" ? (
        <p className="mb-5.5 text-sm text-text-muted">Earn 10 XP for every correct review, 2 XP even if you miss one, 25 XP for each new card you start, and 25 XP for every correct reading test answer.</p>
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
