"use client";

import { useClientClock } from "@/lib/useClientClock";

const TICK_MS = 1_000;

// 1s tick, matching the /study queue's countdown (see QueueProgressBar) -- formatCountdown
// shows exact seconds once under a minute, so anything coarser would visibly stutter.
export function useCountdown(dueAt: string | null): number | null {
  const now = useClientClock(TICK_MS, { active: dueAt !== null });
  if (!dueAt || now === null) return null;
  return new Date(dueAt).getTime() - now;
}
