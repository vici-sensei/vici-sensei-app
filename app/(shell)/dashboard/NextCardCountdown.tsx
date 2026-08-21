"use client";

import { useEffect, useRef } from "react";
import { useCountdown } from "@/lib/useCountdown";
import { formatCountdown } from "@/lib/study/countdown";

/** Live "Xh/Xm/Xs" countdown, ticking every second. `onElapsed` fires once the instant it hits
 * zero -- lets callers refetch stats right when the next card becomes due instead of waiting for
 * the next poll (see StudyStatsProvider's 10-30s interval), so the transition feels instant.
 * `clockOffsetMs` (see useServerClockOffset) corrects for a wrong device clock, same as
 * LeaderboardCountdown -- without it, a skewed clock would show a wrong countdown and could fire
 * onElapsed well before (or after) the card is actually due server-side. */
export function NextCardCountdown({
  dueAt,
  clockOffsetMs = 0,
  onElapsed,
}: {
  dueAt: string;
  clockOffsetMs?: number;
  onElapsed?: () => void;
}) {
  const remainingMs = useCountdown(dueAt, clockOffsetMs);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [dueAt]);

  useEffect(() => {
    if (remainingMs !== null && remainingMs <= 0 && !firedRef.current) {
      firedRef.current = true;
      onElapsed?.();
    }
  }, [remainingMs, onElapsed]);

  if (remainingMs === null) return null;
  if (remainingMs <= 0) return <>now</>;
  return <>in {formatCountdown(remainingMs)}</>;
}
