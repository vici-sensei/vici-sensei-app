"use client";

import { useEffect, useRef, useState } from "react";

// Stays at 0 until `active` flips true, then jumps to `target` one frame later so the CSS
// transition on stroke-dashoffset has a "from" value to animate away from -- setting the
// target directly leaves nothing to transition from, so the ring would just appear already
// filled instead of animating in. Pair with useInView so `active` flips on scroll-into-view.
export function useAnimatedPercent(target: number, active: boolean): number {
  const [animated, setAnimated] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (!hasStarted.current) {
      hasStarted.current = true;
      const id = requestAnimationFrame(() => setAnimated(target));
      return () => cancelAnimationFrame(id);
    }
    setAnimated(target);
  }, [active, target]);

  return animated;
}
