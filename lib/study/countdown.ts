const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Exact countdown text ("3h", "45s") -- single largest unit, ticking live. Shared by the
 * dashboard's "Next card in" hints and the /study queue's countdown so both read the same way. */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));

  if (totalSeconds >= YEAR) return `${Math.floor(totalSeconds / YEAR)}y`;
  if (totalSeconds >= MONTH) return `${Math.floor(totalSeconds / MONTH)}mo`;
  if (totalSeconds >= WEEK) return `${Math.floor(totalSeconds / WEEK)}w`;
  if (totalSeconds >= DAY) return `${Math.floor(totalSeconds / DAY)}d`;
  if (totalSeconds >= HOUR) return `${Math.floor(totalSeconds / HOUR)}h`;
  if (totalSeconds >= MINUTE) return `${Math.floor(totalSeconds / MINUTE)}m`;
  return `${totalSeconds}s`;
}
