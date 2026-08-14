"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchServerTimeMs } from "@/lib/data/serverTime";

/**
 * (server time - local time) at the moment we last checked, so callers can
 * compute `Date.now() + offsetMs` instead of trusting the device clock
 * outright. A user whose system clock is wrong would otherwise get period
 * boundaries and a countdown that don't match everyone else's -- see
 * 20260814_leaderboard_server_time.sql for the failure mode this avoids.
 *
 * Falls back to 0 (trust the local clock) if the check fails -- a bad
 * network hiccup shouldn't block the leaderboard from rendering, and an
 * uncorrected clock is no worse than what every page already does.
 */
export function useServerClockOffset(): number {
  const [offsetMs, setOffsetMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchServerTimeMs(createClient())
      .then((serverMs) => {
        if (!cancelled) setOffsetMs(serverMs - Date.now());
      })
      .catch(() => {
        // keep offsetMs at 0
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return offsetMs;
}
