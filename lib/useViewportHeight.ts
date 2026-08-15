"use client";

import { useEffect } from "react";

const VIEWPORT_EVENTS = ["resize", "scroll"] as const;

// Keeps a `--app-height` custom property in sync with the visual viewport, which
// shrinks live when the on-screen keyboard opens — unlike `100vh`/`window.innerHeight`,
// which stay pinned to the full screen height on iOS Safari while the keyboard is up.
// Consumers fall back to `100dvh` via the CSS var() default before this effect runs.
// `position: fixed` positions relative to the *layout* viewport, so `--app-height` must be
// the visual viewport's bottom edge in layout-viewport coordinates -- offsetTop + height, not
// height alone. Without offsetTop, the value is wrong as soon as the browser scrolls the
// visual viewport to bring a focused input above the keyboard (offsetTop > 0), and it goes
// stale on every later scroll too: scrolling only changes offsetTop, which this would ignore.
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;

    function update() {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      document.documentElement.style.setProperty("--app-height", `${offsetTop + height}px`);
    }

    update();
    VIEWPORT_EVENTS.forEach((event) => viewport?.addEventListener(event, update));
    return () => {
      VIEWPORT_EVENTS.forEach((event) => viewport?.removeEventListener(event, update));
    };
  }, []);
}
