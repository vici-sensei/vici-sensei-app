"use client";

import { useEffect } from "react";

const VIEWPORT_EVENTS = ["resize", "scroll"] as const;

// Keeps a `--app-height` custom property in sync with the visual viewport, which
// shrinks live when the on-screen keyboard opens — unlike `100vh`/`window.innerHeight`,
// which stay pinned to the full screen height on iOS Safari while the keyboard is up.
// Consumers fall back to `100dvh` via the CSS var() default before this effect runs.
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;

    function update() {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    }

    update();
    VIEWPORT_EVENTS.forEach((event) => viewport?.addEventListener(event, update));
    return () => {
      VIEWPORT_EVENTS.forEach((event) => viewport?.removeEventListener(event, update));
    };
  }, []);
}
