"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiGet } from "@/lib/api/client";
import { cardsRemainingToday } from "@/lib/study/stats";
import type { StudyStats } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;
// Polled faster while there's nothing to study — that's exactly the state where a due
// review or a new day is what unblocks the Study button, so staleness matters most here.
const CAUGHT_UP_POLL_INTERVAL_MS = 10_000;

interface StudyStatsContextValue {
  stats: StudyStats;
  studyDisabled: boolean;
  /** True once a poll has failed and no later poll has succeeded yet — stats may be out of date. */
  stale: boolean;
  refresh: () => void;
}

const StudyStatsContext = createContext<StudyStatsContextValue | null>(null);

export function StudyStatsProvider({
  initialStats,
  children,
}: {
  initialStats: StudyStats;
  children: ReactNode;
}) {
  const [stats, setStats] = useState(initialStats);
  const [stale, setStale] = useState(false);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await apiGet<StudyStats>("/api/study/stats");
      if (!cancelledRef.current) {
        setStats(fresh);
        setStale(false);
      }
    } catch {
      if (!cancelledRef.current) setStale(true);
    }
  }, []);

  const allDone = cardsRemainingToday(stats) === 0;

  useEffect(() => {
    cancelledRef.current = false;
    // Don't wait a full interval for the first update after mount — otherwise the button
    // stays frozen at the server-rendered snapshot for up to POLL_INTERVAL_MS after load.
    void refresh();

    const intervalMs = allDone ? CAUGHT_UP_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    const interval = setInterval(refresh, intervalMs);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // Re-armed whenever allDone flips so the poll cadence switches immediately.
  }, [allDone, refresh]);

  return (
    <StudyStatsContext.Provider value={{ stats, studyDisabled: allDone, stale, refresh }}>
      {children}
    </StudyStatsContext.Provider>
  );
}

export function useStudyStats() {
  const ctx = useContext(StudyStatsContext);
  if (!ctx) throw new Error("useStudyStats must be used within a StudyStatsProvider");
  return ctx;
}
