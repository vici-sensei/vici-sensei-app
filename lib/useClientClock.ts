"use client";

import { useEffect, useState } from "react";

/** Ticks a client-only "now" timestamp on an interval, starting as null until the first tick.
 * The visitor's clock/timezone is only known client-side -- computing "now" during SSR would
 * make the server's markup mismatch the client's and trip a hydration error, so callers bail
 * out of rendering anything time-dependent while this is still null. Shared by useCountdown and
 * LeaderboardCountdown. */
export function useClientClock(intervalMs: number, options?: { offsetMs?: number; active?: boolean }): number | null {
  const { offsetMs = 0, active = true } = options ?? {};
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    function tick() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNow(Date.now() + offsetMs);
    }
    tick();
    const interval = setInterval(tick, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, offsetMs, active]);

  return now;
}
