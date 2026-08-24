"use client";

import { useEffect } from "react";

/** Registers the precache service worker generated at build time (see
 * scripts/generate-sw.mjs). Progressive enhancement only -- offline/instant-repeat-load support,
 * nothing the app depends on, so a failed or unsupported registration is silently ignored. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
