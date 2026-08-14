import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

const METRICS: LeaderboardMetric[] = ["reviews", "new_cards", "streak", "xp"];
const PERIODS: LeaderboardPeriod[] = ["daily", "weekly", "monthly", "yearly", "all_time"];

const METRIC_KEY = "leaderboard:metric";
const PERIOD_KEY = "leaderboard:period";

export function readStoredMetric(fallback: LeaderboardMetric): LeaderboardMetric {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(METRIC_KEY);
    if (raw && (METRICS as string[]).includes(raw)) return raw as LeaderboardMetric;
  } catch {
    return fallback;
  }
  return fallback;
}

export function writeStoredMetric(metric: LeaderboardMetric) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(METRIC_KEY, metric);
  } catch {
    // ignore (private browsing / quota)
  }
}

export function readStoredPeriod(fallback: LeaderboardPeriod): LeaderboardPeriod {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PERIOD_KEY);
    if (raw && (PERIODS as string[]).includes(raw)) return raw as LeaderboardPeriod;
  } catch {
    return fallback;
  }
  return fallback;
}

export function writeStoredPeriod(period: LeaderboardPeriod) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERIOD_KEY, period);
  } catch {
    // ignore (private browsing / quota)
  }
}
