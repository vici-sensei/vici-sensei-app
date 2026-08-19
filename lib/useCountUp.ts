"use client";

import { useEffect, useRef, useState } from "react";

// Animates the displayed integer counting up whenever `target` increases (e.g. the "Day
// streak" placeholder 0 resolving to the real streak once stats load). A decrease, or the
// very first value, snaps instantly -- there's nothing to count up from yet.
export function useCountUp(target: number, durationMs = 700): number {
  const [displayed, setDisplayed] = useState(target);
  const prevTargetRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevTargetRef.current;
    prevTargetRef.current = target;
    if (target <= from) {
      setDisplayed(target);
      return;
    }

    const start = performance.now();
    function step(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplayed(Math.round(from + (target - from) * t));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return displayed;
}
