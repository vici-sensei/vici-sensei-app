"use client";

import { useClientClock } from "@/lib/useClientClock";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import type { UserProfile } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// Rounded up, same as the Teacher panel's "Nd left" -- a fresh 7-day trial reads "7 days", not 6.
function formatRemaining(ms: number): string {
  if (ms < HOUR_MS) return "Less than an hour";
  if (ms < DAY_MS) {
    const hours = Math.ceil(ms / HOUR_MS);
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.ceil(ms / DAY_MS);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** "N days of Pro left" for Pro with an end date (the sign-up trial or an admin-set one). Renders
 *  nothing for no end date (Stripe or unlimited) or a date that has already passed --
 *  premium-trial-expiry only runs every 5 minutes, so is_premium can still read true for a bit.
 *  Must sit inside a StudyStatsProvider (both layouts that render Header have one). */
export function ProTimeLeft({ user }: { user: Pick<UserProfile, "is_premium" | "premium_until"> }) {
  // `premium_until` can be undefined too: a profile cached in localStorage before the column was
  // selected, until the background refetch replaces it.
  const until = user.is_premium ? user.premium_until : null;
  // Server time, not the device clock: premium-trial-expiry ends Pro by the server's clock, and
  // with the day count rounded up, a device clock only half an hour behind already turns a fresh
  // 7-day trial into "8 days".
  const { clockOffsetMs } = useStudyStats();
  const now = useClientClock(60_000, { offsetMs: clockOffsetMs, active: !!until });

  const ms = until && now !== null ? Date.parse(until) - now : 0;
  if (!until || !(ms > 0)) return null;

  return (
    <div
      className="whitespace-nowrap text-[0.8rem] text-text-muted"
      title={`Pro ends ${dateFormatter.format(new Date(until))}`}
    >
      <span className="font-bold text-accent-gold">{formatRemaining(ms)}</span> of Pro left
    </div>
  );
}
