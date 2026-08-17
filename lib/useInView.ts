"use client";

import { useEffect, useRef, useState } from "react";

// Fires once the observed element is fully inside the viewport (threshold 1), then stops
// observing -- callers use the returned flag to gate a mount-triggered animation so it plays
// on scroll-into-view instead of immediately on mount.
export function useInView<T extends Element>(threshold = 1): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true);
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, threshold]);

  return [ref, inView];
}
