"use client";

import { useEffect, useState } from "react";

const TICK_MS = 1_000;

// 1s tick, matching the /study queue's countdown (see QueueProgressBar) -- formatCountdown
// shows exact seconds once under a minute, so anything coarser would visibly stutter.
export function useCountdown(dueAt: string | null): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!dueAt) return;
    // The visitor's clock is only known client-side -- computing "now" during SSR would make
    // the server's markup mismatch the client's and trip a hydration error (see NextReviewTime).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [dueAt]);

  if (!dueAt || now === null) return null;
  return new Date(dueAt).getTime() - now;
}
