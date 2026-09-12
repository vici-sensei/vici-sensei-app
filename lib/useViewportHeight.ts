"use client";

import { useEffect } from "react";

// Keeps a `--app-height` custom property in sync with the visual viewport, which
// shrinks live when the on-screen keyboard opens — unlike `100vh`/`window.innerHeight`,
// which stay pinned to the full screen height on iOS Safari while the keyboard is up.
// Consumers fall back to `100dvh` via the CSS var() default before this effect runs.
// Every consumer sizes a normal (statically positioned, top-of-document) element, not a
// `position: fixed` one -- so this must be just the visible height (`viewport.height`).
// Adding `offsetTop` (the visual viewport's pan distance, which is what a *fixed* element
// pinned to the layout viewport would need to compensate for) would only be correct for a
// fixed element; on a static one it inflates the height by however much the browser has
// panned to bring a focused input above the keyboard, making the page taller/scrollable
// instead of shrinking it to fit above the keyboard -- the opposite of the point here.
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;

    function update() {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    }

    update();
    viewport?.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
    };
  }, []);
}
