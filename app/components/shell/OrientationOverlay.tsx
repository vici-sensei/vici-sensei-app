"use client";

import { RotateDeviceIcon } from "@/app/components/shell/RotateDeviceIcon";
import { useDeviceOrientation } from "@/lib/useDeviceOrientation";

// Blocks interaction whenever a touch device is held in landscape. Always rendered, with
// visibility decided in CSS (the vici-orientation-overlay rules in globals.css, gated on
// `pointer: coarse` so a landscape desktop monitor with a mouse never triggers it). The real
// device orientation (see useDeviceOrientation) is handed to that CSS as `data-orientation`
// rather than the `orientation` media query, because the media query flips to "landscape" when
// the on-screen keyboard shrinks the viewport below its width. Until the hook has a value
// (server render, first paint, or no Screen Orientation API) the attribute is absent and the
// overlay stays hidden; the web app manifest already locks the orientation to portrait.
export function OrientationOverlay() {
  const orientation = useDeviceOrientation();

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-orientation={orientation ?? undefined}
      className="vici-orientation-overlay fixed inset-0 z-[9999] flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
    >
      <RotateDeviceIcon size={112} className="text-text-muted" />
      <p className="px-8 text-center font-extrabold uppercase tracking-wide text-text-muted/70">
        Please rotate your device back to portrait
      </p>
    </div>
  );
}
