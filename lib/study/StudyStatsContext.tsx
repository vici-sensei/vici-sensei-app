"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getStudyStats } from "@/lib/client-data/studyStats";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { cardsRemainingToday } from "@/lib/study/stats";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { StudyStats } from "@/lib/types";

const POLL_INTERVAL_MS = 30_000;
// Polled faster while there's nothing to study — that's exactly the state where a due
// review or a new day is what unblocks the Study button, so staleness matters most here.
const CAUGHT_UP_POLL_INTERVAL_MS = 10_000;

function studyStatsCacheKey(userId: string): string {
  return `cache:study-stats:${userId}`;
}

interface StudyStatsContextValue {
  stats: StudyStats | null;
  /** True while stats are unset (first load hasn't landed yet) or all caught up — safe default: don't let the user click into an empty/unknown study session. */
  studyDisabled: boolean;
  /** True once a poll has failed and no later poll has succeeded yet — stats may be out of date. */
  stale: boolean;
  /** (server time - local time), for countdowns built on `stats.next_due_at` to correct against a
   * wrong device clock -- see useServerClockOffset. */
  clockOffsetMs: number;
  refresh: () => void;
}

const StudyStatsContext = createContext<StudyStatsContextValue | null>(null);

export function StudyStatsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [stale, setStale] = useState(false);
  const clockOffsetMs = useServerClockOffset();
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const fresh = await getStudyStats(user.id);
      if (!cancelledRef.current) {
        setStats(fresh);
        setStale(false);
        writeCache(studyStatsCacheKey(user.id), fresh);
      }
    } catch {
      if (!cancelledRef.current) setStale(true);
    }
  }, [user]);

  const allDone = stats ? cardsRemainingToday(stats) === 0 : false;

  useEffect(() => {
    if (!user) return;
    cancelledRef.current = false;

    // Instant paint from the last known stats (this session's previous mount, or a prior app
    // open) -- purely provisional, refresh() right below always runs and overwrites it once
    // the real fetch resolves.
    const cached = readCache<StudyStats>(studyStatsCacheKey(user.id));
    if (cached) setStats(cached);

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
  }, [user, allDone, refresh]);

  return (
    <StudyStatsContext.Provider value={{ stats, studyDisabled: !stats || allDone, stale, clockOffsetMs, refresh }}>
      {children}
    </StudyStatsContext.Provider>
  );
}

export function useStudyStats() {
  const ctx = useContext(StudyStatsContext);
  if (!ctx) throw new Error("useStudyStats must be used within a StudyStatsProvider");
  return ctx;
}
