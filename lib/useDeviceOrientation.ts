"use client";

import { useSyncExternalStore } from "react";

export type DeviceOrientation = "portrait" | "landscape";

// The physical orientation of the device screen, from `screen.orientation`. Unlike the CSS
// `orientation` media query -- which just compares the *viewport's* width to its height -- this
// isn't affected by the on-screen keyboard: with `interactiveWidget: "resizes-content"` the
// keyboard shrinks the layout viewport, and a tall keyboard (e.g. a Japanese IME with its
// candidate bar) can leave it wider than it is tall while the phone is still held in portrait.
// `null` on the server and in browsers without the Screen Orientation API, so callers can fall
// back to the media query there.
function subscribe(onChange: () => void) {
  const orientation = window.screen.orientation;
  orientation?.addEventListener("change", onChange);
  return () => {
    orientation?.removeEventListener("change", onChange);
  };
}

function getSnapshot(): DeviceOrientation | null {
  const type = window.screen.orientation?.type;
  if (!type) return null;
  return type.startsWith("landscape") ? "landscape" : "portrait";
}

function getServerSnapshot() {
  return null;
}

export function useDeviceOrientation(): DeviceOrientation | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
