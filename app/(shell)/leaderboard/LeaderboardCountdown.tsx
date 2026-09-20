"use client";

import { useEffect, useRef, useState } from "react";
import { useCountdown } from "@/lib/useCountdown";
import { getLeaderboardPeriodEnd } from "@/lib/client-data/leaderboard";
import { formatTimeLeft } from "@/lib/leaderboard/timeLeft";
import { ClockSkewNotice } from "@/app/components/ui/ClockSkewNotice";
import type { LeaderboardPeriod } from "@/lib/types";

/** Counts down to the end of the viewer's own current period -- the next 6 a.m. study-day boundary in
 * their timezone, the same study day every board scores each row on (see leaderboard_period_end).
 * The end instant comes from the database, not the UTC calendar, so it stays right across timezones
 * and DST. `clockOffsetMs` corrects for a wrong local clock -- see useServerClockOffset. */
export function LeaderboardCountdown({ period, clockOffsetMs }: { period: LeaderboardPeriod; clockOffsetMs: number }) {
  // Keyed by the period it was fetched for, so switching tabs never shows the previous period's end.
  const [fetched, setFetched] = useState<{ period: LeaderboardPeriod; end: string | null } | null>(null);
  // Bumped when the current window ends, to fetch the next one.
  const [rollover, setRollover] = useState(0);
  const handledEndRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLeaderboardPeriodEnd(period)
      .then((end) => {
        if (!cancelled) setFetched({ period, end });
      })
      .catch(() => {
        // No countdown is better than a wrong one.
        if (!cancelled) setFetched({ period, end: null });
      });
    return () => {
      cancelled = true;
    };
  }, [period, rollover]);

  const end = fetched && fetched.period === period ? fetched.end : null;
  const remaining = useCountdown(end, clockOffsetMs);

  useEffect(() => {
    function startNextWindow() {
      handledEndRef.current = end;
      setRollover((n) => n + 1);
    }
    // Once per end instant, so a server clock a hair behind can't make this refetch every tick.
    if (end && remaining !== null && remaining <= 0 && handledEndRef.current !== end) startNextWindow();
  }, [end, remaining]);

  if (remaining === null) return null;

  return (
    <p className="mb-5.5 text-sm text-text-muted">
      Resets in <span className="font-semibold text-accent-blue/80">{formatTimeLeft(remaining)}</span>
      <ClockSkewNotice clockOffsetMs={clockOffsetMs} />
    </p>
  );
}
