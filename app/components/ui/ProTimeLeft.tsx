"use client";

import Link from "next/link";
import { useClientClock } from "@/lib/useClientClock";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import type { UserProfile } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** The exact moment Pro ends, e.g. "Oct 12, 2026, 3:40 PM" in the visitor's locale and timezone.
 *  Only call it client-side after mount (the locale/timezone mismatch SSR otherwise). */
export function formatProEnd(until: string): string {
  return dateFormatter.format(new Date(until));
}

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

/** Ms of Pro left for Pro with an end date (the sign-up trial or an admin-set one). null for no end
 *  date (Stripe or unlimited), a date that has already passed -- premium-trial-expiry only runs every
 *  5 minutes, so is_premium can still read true for a bit -- and until the clock's first tick.
 *  Must sit inside a StudyStatsProvider (both layouts that render Header have one). */
export function useProTimeLeft(user: Pick<UserProfile, "is_premium" | "premium_until">): number | null {
  // `premium_until` can be undefined too: a profile cached in localStorage before the column was
  // selected, until the background refetch replaces it.
  const until = user.is_premium ? user.premium_until : null;
  // Server time, not the device clock: premium-trial-expiry ends Pro by the server's clock, and
  // with the day count rounded up, a device clock only half an hour behind already turns a fresh
  // 7-day trial into "8 days".
  const { clockOffsetMs } = useStudyStats();
  const now = useClientClock(60_000, { offsetMs: clockOffsetMs, active: !!until });

  const ms = until && now !== null ? Date.parse(until) - now : 0;
  return ms > 0 ? ms : null;
}

/** "N days of Pro left" for Pro with an end date. Renders nothing when useProTimeLeft has no time to
 *  show. With `href` the whole line is a link (e.g. to /settings/billing); `onClick` lets a menu
 *  close itself on the way out. Leave `href` off where the link would point at the current page. */
export function ProTimeLeft({
  user,
  href,
  onClick,
}: {
  user: Pick<UserProfile, "is_premium" | "premium_until">;
  href?: string;
  onClick?: () => void;
}) {
  const ms = useProTimeLeft(user);
  if (ms === null || !user.premium_until) return null;

  const baseClasses = "whitespace-nowrap text-[0.8rem] text-text-muted";
  const title = `Pro ends ${formatProEnd(user.premium_until)}`;
  const content = (
    <>
      <span className="font-bold text-accent-gold">{formatRemaining(ms)}</span> of Pro left
    </>
  );

  if (!href) {
    return (
      <div className={baseClasses} title={title}>
        {content}
      </div>
    );
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      title={title}
      className={`${baseClasses} hover:text-white hover:underline focus-visible:text-white focus-visible:underline`}
    >
      {content}
    </Link>
  );
}
