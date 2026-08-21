"use client";

import { useClientClock } from "@/lib/useClientClock";

const TICK_MS = 1_000;

// 1s tick, matching the /study queue's countdown (see QueueProgressBar) -- formatCountdown
// shows exact seconds once under a minute, so anything coarser would visibly stutter.
// `offsetMs` (see useServerClockOffset) corrects for a wrong local clock, same as
// LeaderboardCountdown -- `dueAt` is always a server-computed instant, so counting down
// against an uncorrected device clock would show a wrong (or immediately-elapsed) time.
export function useCountdown(dueAt: string | null, offsetMs = 0): number | null {
  const now = useClientClock(TICK_MS, { offsetMs, active: dueAt !== null });
  if (!dueAt || now === null) return null;
  return new Date(dueAt).getTime() - now;
}
