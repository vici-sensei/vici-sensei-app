"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Keeps a `tz` cookie in sync with the browser's IANA timezone, so server-side "today" boundaries (daily new-card quotas) reset at the user's local midnight instead of UTC midnight. Renders nothing. */
export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone || readCookie("tz") === timezone) return;

    document.cookie = `tz=${encodeURIComponent(timezone)}; path=/; max-age=31536000; samesite=lax`;
    // The server already rendered this load using UTC (or a stale zone) boundaries —
    // refresh once so it re-fetches with the corrected cookie in place.
    router.refresh();
  }, [router]);

  return null;
}
