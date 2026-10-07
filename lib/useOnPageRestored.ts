"use client";

import { useEffect, useRef } from "react";

/** Runs `onRestored` when the browser brings this page back from its back/forward cache.
 *
 * A button that sets `loading` and then leaves the page with a full navigation (an OAuth redirect,
 * `window.location.assign(...)`) never remounts when the person hits Back: the page is restored
 * exactly as it was, with the spinner still spinning. Reset that state here. It does not fire on
 * the first load or on a client-side (router) navigation, which remounts the component anyway. */
export function useOnPageRestored(onRestored: () => void) {
  const latest = useRef(onRestored);
  useEffect(() => {
    latest.current = onRestored;
  });

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) latest.current();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
}
