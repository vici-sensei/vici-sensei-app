import { timeZoneOffsetMinutes } from "@/lib/timezone";

/** Lessons are scheduled in New York wall-clock time and shown in the student's own timezone. A
 * calendar day or week is a stretch of the STUDENT's local clock, so none of this can be done in UTC
 * or with `new Date(y, m, d)` (the browser's own zone, which is not necessarily the account's).
 * Calendar dates travel as "YYYY-MM-DD" keys; instants as epoch milliseconds. */

export const NY_TZ = "America/New_York";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

const pad = (n: number) => String(n).padStart(2, "0");

// ---- calendar-date keys: pure calendar arithmetic, no timezone involved ----

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDaysKey(key: string, days: number): string {
  return utcMsToKey(keyToUtcMs(key) + days * DAY_MS);
}

/** ISO weekday of a date key: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(key: string): number {
  const dow = new Date(keyToUtcMs(key)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

// ---- instants <-> a timezone's wall clock ----

const wallFormatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(tz: string): Intl.DateTimeFormat {
  let f = wallFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    wallFormatters.set(tz, f);
  }
  return f;
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function wallClock(ms: number, tz: string): WallClock {
  const parts = wallFormatter(tz).formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Some engines print midnight as 24 even with hourCycle h23.
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** The calendar date `ms` falls on in `tz`. */
export function localDateKey(ms: number, tz: string): string {
  const w = wallClock(ms, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Minutes east of UTC that `tz` is at the instant `ms`. */
export function offsetMinutes(ms: number, tz: string): number {
  return timeZoneOffsetMinutes(tz, new Date(ms));
}

/** The instant at which `tz`'s wall clock shows `key` at hour:minute. An ambiguous time (clocks go
 * back) resolves to the later occurrence, the standard-time one; a time that does not exist (clocks go
 * forward) resolves to the instant right after the gap. Both are the answers Postgres'
 * `timestamp AT TIME ZONE` gives, which the lesson writer uses for week boundaries. */
export function wallToInstant(key: string, hour: number, minute: number, tz: string): number {
  const [y, mo, d] = key.split("-").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, hour, minute);
  const before = offsetMinutes(asUtc - DAY_MS, tz);
  const after = offsetMinutes(asUtc + DAY_MS, tz);
  const valid: number[] = [];
  for (const off of new Set([before, after])) {
    const t = asUtc - off * MINUTE_MS;
    if (offsetMinutes(t, tz) === off) valid.push(t);
  }
  if (valid.length > 0) return Math.max(...valid);
  return asUtc - Math.min(before, after) * MINUTE_MS;
}

// ---- days and weeks in the student's timezone ----

export interface DayRange {
  key: string;
  startMs: number;
  endMs: number;
}

export function dayRange(key: string, tz: string): DayRange {
  return { key, startMs: wallToInstant(key, 0, 0, tz), endMs: wallToInstant(addDaysKey(key, 1), 0, 0, tz) };
}

export interface WeekRange {
  startKey: string;
  /** Exclusive. */
  endKey: string;
  days: string[];
  startMs: number;
  endMs: number;
}

/** The week containing `key` that starts on ISO weekday `weekStart` (1 = Monday ... 7 = Sunday), by
 * `tz`'s midnights. A week is 167, 168 or 169 hours when the clocks change inside it. */
export function weekRange(key: string, weekStart: number, tz: string): WeekRange {
  const back = (isoWeekday(key) - weekStart + 7) % 7;
  const startKey = addDaysKey(key, -back);
  const endKey = addDaysKey(startKey, 7);
  return {
    startKey,
    endKey,
    days: Array.from({ length: 7 }, (_, i) => addDaysKey(startKey, i)),
    startMs: wallToInstant(startKey, 0, 0, tz),
    endMs: wallToInstant(endKey, 0, 0, tz),
  };
}

/** The weekday the student's week starts on for the week containing `key`: their current one, or the one
 * they switched to once that change has taken effect (a change applies from the next week). */
export function weekStartFor(
  student: { week_start: number; pending: { effective_from: string; week_start: number } | null },
  key: string,
  tz: string
): number {
  if (!student.pending) return student.week_start;
  const thisWeek = weekRange(key, student.week_start, tz);
  return thisWeek.startMs >= Date.parse(student.pending.effective_from) ? student.pending.week_start : student.week_start;
}

/** Milliseconds until `tz`'s next midnight after `nowMs` (what "today" waits for to roll over). */
export function msUntilLocalMidnight(nowMs: number, tz: string): number {
  const today = localDateKey(nowMs, tz);
  return wallToInstant(addDaysKey(today, 1), 0, 0, tz) - nowMs;
}

// ---- daylight-saving shifts ----

/** By how many minutes this lesson's time on the student's clock differs from the same class a week
 * earlier. The class keeps its New York time, so a difference means the two timezones did not change
 * clocks on the same date: positive = later on the student's clock than last week. 0 almost always. */
export function weeklyShiftMinutes(startMs: number, tz: string): number {
  const ny = wallClock(startMs, NY_TZ);
  const key = `${ny.year}-${pad(ny.month)}-${pad(ny.day)}`;
  const prevMs = wallToInstant(addDaysKey(key, -7), ny.hour, ny.minute, NY_TZ);
  const gap = (ms: number) => offsetMinutes(ms, tz) - offsetMinutes(ms, NY_TZ);
  return gap(startMs) - gap(prevMs);
}

// ---- formatting (the browser's own locale, so 12/24-hour follows the reader) ----

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatClock(ms: number, tz: string): string {
  let f = clockFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" });
    clockFormatters.set(tz, f);
  }
  return f.format(ms);
}

export function formatTimeRange(startMs: number, endMs: number, tz: string): string {
  return `${formatClock(startMs, tz)} – ${formatClock(endMs, tz)}`;
}

/** "Mon", "Monday", "Mar 9" for a date key (formatted as UTC noon so the zone cannot move the day). */
export function formatKey(key: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(keyToUtcMs(key) + DAY_MS / 2);
}

/** "Mar 2 – 8, 2026" / "Feb 23 – Mar 1, 2026" for a week. */
export function formatWeekLabel(week: WeekRange): string {
  const last = addDaysKey(week.endKey, -1);
  const sameMonth = week.startKey.slice(0, 7) === last.slice(0, 7);
  const start = formatKey(week.startKey, { month: "short", day: "numeric" });
  const end = formatKey(last, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  const year = formatKey(last, { year: "numeric" });
  return `${start} – ${end}, ${year}`;
}

/** "EEST", "GMT+3"... for the zone at that instant. */
export function zoneAbbreviation(ms: number, tz: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(ms)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}
