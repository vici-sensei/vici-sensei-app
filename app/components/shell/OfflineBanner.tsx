"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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
