import type { LeaderboardPeriod } from "@/lib/types";

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
