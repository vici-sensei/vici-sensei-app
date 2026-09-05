"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { WifiOffIcon } from "@/app/components/shell/WifiOffIcon";

// Blocks all interaction while offline: a solid backdrop above every other z-index in the app
// (Toast tops out at z-[300]). Unlike Modal.tsx, this never closes on its own terms -- it has no
// close button, Escape handler, or backdrop-click dismissal, and just unmounts the instant the
// browser fires "online" again.
export function OfflineOverlay() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
    >
      <WifiOffIcon
        size={112}
        className="animate-[vici-wifi-breath_1.6s_ease-in-out_infinite] text-text-muted"
      />
      <p className="font-extrabold uppercase tracking-wide text-text-muted/70">No Internet</p>
    </div>
  );
}
