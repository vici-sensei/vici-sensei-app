"use client";

import { useEffect, useState } from "react";

/** Ticks a client-only "now" timestamp on an interval, starting as null until the first tick.
 * The visitor's clock/timezone is only known client-side -- computing "now" during SSR would
 * make the server's markup mismatch the client's and trip a hydration error, so callers bail
 * out of rendering anything time-dependent while this is still null. Shared by useCountdown and
 * LeaderboardCountdown.
 *
 * Anchored to `performance.now()` (a monotonic clock that only moves forward at a steady rate,
 * unlike the OS wall clock -- immune to sleep/wake, DST, or the user manually adjusting it) rather
 * than re-reading `Date.now()` on every tick: the wall clock (folded together with `offsetMs`,
 * see useServerClockOffset) is sampled once, when the effect (re-)runs, and every tick after that
 * just adds monotonic elapsed time to that sample. A countdown built on this can't jump or misfire
 * `onElapsed` because the visitor's clock changed mid-session -- only the anchor itself, taken
 * fresh whenever `offsetMs` updates, can be off. */
export function useClientClock(intervalMs: number, options?: { offsetMs?: number; active?: boolean }): number | null {
  const { offsetMs = 0, active = true } = options ?? {};
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const anchorWallMs = Date.now() + offsetMs;
    const anchorPerfMs = performance.now();
    function tick() {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNow(anchorWallMs + (performance.now() - anchorPerfMs));
    }
    tick();
    const interval = setInterval(tick, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, offsetMs, active]);

  return now;
}
