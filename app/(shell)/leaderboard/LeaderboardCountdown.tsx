"use client";

import { useClientClock } from "@/lib/useClientClock";
import { getPeriodEnd } from "@/lib/leaderboard/period";
import { formatTimeLeft } from "@/lib/leaderboard/timeLeft";
import { ClockSkewNotice } from "@/app/components/ui/ClockSkewNotice";
import type { LeaderboardPeriod } from "@/lib/types";

/** `clockOffsetMs` corrects for a wrong local clock -- see useServerClockOffset. */
export function LeaderboardCountdown({ period, clockOffsetMs }: { period: LeaderboardPeriod; clockOffsetMs: number }) {
  const now = useClientClock(1000, { offsetMs: clockOffsetMs });

  if (now === null) return null;

  const periodEnd = getPeriodEnd(period, new Date(now));
  if (!periodEnd) return null;

  const remaining = new Date(periodEnd).getTime() - now;
  return (
    <p className="mb-5.5 text-sm text-text-muted">
      Resets in <span className="font-semibold text-accent-blue/80">{formatTimeLeft(remaining)}</span>
      <ClockSkewNotice clockOffsetMs={clockOffsetMs} />
    </p>
  );
}
