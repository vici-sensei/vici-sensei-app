import type { LeaderboardPeriod } from "@/lib/types";

/**
 * Start of `period` as a UTC instant, or null for "all_time" (no filter).
 * Deliberately a single fixed UTC boundary rather than per-user local time
 * (like utcDayBounds in lib/srs/day.ts) -- a global leaderboard needs one
 * shared reset moment for every participant, not one per viewer.
 */
export function getPeriodStart(period: LeaderboardPeriod, reference: Date = new Date()): string | null {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const date = reference.getUTCDate();

  switch (period) {
    case "daily":
      return new Date(Date.UTC(year, month, date)).toISOString();
    case "weekly": {
      const daysSinceMonday = (reference.getUTCDay() + 6) % 7;
      return new Date(Date.UTC(year, month, date - daysSinceMonday)).toISOString();
    }
    case "monthly":
      return new Date(Date.UTC(year, month, 1)).toISOString();
    case "yearly":
      return new Date(Date.UTC(year, 0, 1)).toISOString();
    case "all_time":
      return null;
  }
}

/** The next reset boundary for `period` (i.e. when the current window ends), or null for "all_time". */
export function getPeriodEnd(period: LeaderboardPeriod, reference: Date = new Date()): string | null {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const date = reference.getUTCDate();

  switch (period) {
    case "daily":
      return new Date(Date.UTC(year, month, date + 1)).toISOString();
    case "weekly": {
      const daysSinceMonday = (reference.getUTCDay() + 6) % 7;
      return new Date(Date.UTC(year, month, date - daysSinceMonday + 7)).toISOString();
    }
    case "monthly":
      return new Date(Date.UTC(year, month + 1, 1)).toISOString();
    case "yearly":
      return new Date(Date.UTC(year + 1, 0, 1)).toISOString();
    case "all_time":
      return null;
  }
}
