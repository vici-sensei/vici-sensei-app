import { RotateDeviceIcon } from "@/app/components/shell/RotateDeviceIcon";

// Blocks interaction whenever a touch device is held in landscape. Visibility is pure CSS (the
// vici-orientation-overlay rule in globals.css, gated on `orientation: landscape` + `pointer:
// coarse` so a landscape desktop monitor with a mouse never triggers it) -- always rendered here,
// never toggled from JS, so there's no hydration flash while a media query state is detected.
export function OrientationOverlay() {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="vici-orientation-overlay fixed inset-0 z-[9999] flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
    >
      <RotateDeviceIcon size={112} className="text-text-muted" />
      <p className="px-8 text-center font-extrabold uppercase tracking-wide text-text-muted/70">
        Please rotate your device back to portrait
      </p>
    </div>
  );
}
