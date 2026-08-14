const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

function unit(amount: number, word: string): string {
  return `${amount} ${word}${amount === 1 ? "" : "s"}`;
}

/**
 * Humanizes a countdown at whatever granularity is actually informative for
 * the amount of time left -- months/weeks/days alone once it's that far out,
 * but a compound "hours & minutes" / "minutes & seconds" once the reset is
 * close enough that the coarser unit alone would hide how much time is left.
 */
export function formatTimeLeft(remainingMs: number): string {
  const remaining = Math.max(0, remainingMs);

  if (remaining >= MONTH) return unit(Math.floor(remaining / MONTH), "month");
  if (remaining >= WEEK) return unit(Math.floor(remaining / WEEK), "week");
  if (remaining >= DAY) return unit(Math.floor(remaining / DAY), "day");

  if (remaining >= HOUR) {
    const hours = Math.floor(remaining / HOUR);
    const minutes = Math.floor((remaining % HOUR) / MINUTE);
    return `${unit(hours, "hour")} & ${unit(minutes, "minute")}`;
  }

  if (remaining >= MINUTE) {
    const minutes = Math.floor(remaining / MINUTE);
    const seconds = Math.floor((remaining % MINUTE) / SECOND);
    return `${unit(minutes, "minute")} & ${unit(seconds, "second")}`;
  }

  return unit(Math.floor(remaining / SECOND), "second");
}
