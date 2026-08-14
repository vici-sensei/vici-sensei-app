"use client";

import { useEffect, useState } from "react";
import { getPeriodEnd } from "@/lib/leaderboard/period";
import { formatTimeLeft } from "@/lib/leaderboard/timeLeft";
import type { LeaderboardPeriod } from "@/lib/types";

const NOTABLE_SKEW_MS = 60_000;

/** `clockOffsetMs` corrects for a wrong local clock -- see useServerClockOffset. */
export function LeaderboardCountdown({ period, clockOffsetMs }: { period: LeaderboardPeriod; clockOffsetMs: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    function tick() {
      setNow(Date.now() + clockOffsetMs);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [period, clockOffsetMs]);

  if (now === null) return null;

  const periodEnd = getPeriodEnd(period, new Date(now));
  if (!periodEnd) return null;

  const remaining = new Date(periodEnd).getTime() - now;
  return (
    <p className="mb-5.5 text-sm text-text-muted">
      Resets in <span className="font-semibold text-white">{formatTimeLeft(remaining)}</span>
      {Math.abs(clockOffsetMs) > NOTABLE_SKEW_MS ? (
        <span className="block text-xs text-text-muted/70">
          Your device clock looks off, so this is synced to server time instead.
        </span>
      ) : null}
    </p>
  );
}
