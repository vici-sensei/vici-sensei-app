import type { StudySettings } from "@/lib/types";
import { timezonesForCountry } from "@/lib/timezoneCountry";

/** The hour the study day rolls over at, in the student's timezone (study_day_bounds server-side). */
export const STUDY_DAY_START_HOUR = 6;

/** IANA name of the timezone the browser/OS reports. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

type TimeZonePreference = Pick<StudySettings, "timezone_preference_enabled" | "preferred_timezone">;

/** The timezone the student's study day is counted in: their custom pick while "Custom timezone" is
 * on, otherwise the device's. A settings object cached before the columns existed has neither key,
 * which reads as off -- same as the columns' own defaults. */
export function resolveTimeZone(settings: Partial<TimeZonePreference> | null | undefined): string {
  return settings?.timezone_preference_enabled && settings.preferred_timezone
    ? settings.preferred_timezone
    : deviceTimeZone();
}

// Non-React study/dashboard/leaderboard calls (lib/client-data/*) have no hook to read the settings
// from, so useStudySettings and every settings update publish the resolved timezone here. It's set
// the same moment the settings themselves are (including the synchronous cache hydration on mount),
// so it's in place before any of those calls fire. null = nothing published yet -> the device's.
let activeTimeZone: string | null = null;

export function setActiveTimeZone(settings: Partial<TimeZonePreference> | null | undefined): void {
  activeTimeZone = settings ? resolveTimeZone(settings) : null;
}

/** The timezone every study-day-sensitive request should send -- see resolveTimeZone. */
export function getActiveTimeZone(): string {
  return activeTimeZone ?? deviceTimeZone();
}

/** The country's timezone to preselect: the device's own if it belongs to that country, otherwise
 * the country's main one. A country with no known timezones (or none set) falls back to the device's. */
export function defaultTimeZoneFor(country: string | null | undefined, device: string = deviceTimeZone()): string {
  const zones = timezonesForCountry(country);
  if (zones.length === 0) return device;
  return zones.includes(device) ? device : zones[0];
}

/** "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function timeZoneCity(timeZone: string): string {
  const name = timeZone.slice(timeZone.lastIndexOf("/") + 1);
  return name.replace(/_/g, " ");
}

// Building an Intl.DateTimeFormat is far slower than using one, and the Settings picker formats
// every zone of a country on each re-render -- so one formatter per zone is kept.
const wallClockPartsFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = wallClockPartsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    wallClockPartsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Minutes east of UTC that `timeZone` is at `at` -- DST included, since it reads the wall clock. */
export function timeZoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = wallClockPartsFormatter(timeZone).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((wallClockAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** "UTC", "UTC+3", "UTC-4", "UTC+5:30". */
export function timeZoneOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const minutes = timeZoneOffsetMinutes(timeZone, at);
  if (minutes === 0) return "UTC";
  const sign = minutes > 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, "0")}` : ""}`;
}

/** "Bucharest (UTC+3)". */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  return `${timeZoneCity(timeZone)} (${timeZoneOffsetLabel(timeZone, at)})`;
}

/** "Mon 14:32" -- the wall-clock time in `timeZone`, in the visitor's own locale and 12/24h setting. */
export function timeZoneWallClock(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(at);
}
