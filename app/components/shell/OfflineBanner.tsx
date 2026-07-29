"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (online) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-accent-blue/30 bg-accent-blue/[0.08] px-[18px] py-[13px] text-[0.88rem] font-bold text-white">
      <span className="h-2 w-2 shrink-0 animate-[vici-pulse_1.6s_infinite] rounded-full bg-accent-blue" />
      <span>
        Connection issue — retrying <span className="font-semibold text-text-muted">(some features may be unavailable)</span>
      </span>
    </div>
  );
}
