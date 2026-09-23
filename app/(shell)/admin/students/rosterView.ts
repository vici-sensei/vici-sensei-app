import type { Region } from "@/lib/supabase/regions";
import type { StudentRosterRow } from "@/lib/types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Pro access
// ---------------------------------------------------------------------------

/** "unlimited" = admin-granted Pro with no end date; "trial" = Pro with an end date still ahead. */
export type ProState = "stripe" | "unlimited" | "trial" | "free";

type ProFields = Pick<StudentRosterRow, "is_premium" | "has_stripe" | "premium_until">;

export function proState(s: ProFields, now: number): ProState {
  if (!s.is_premium) return "free";
  if (s.has_stripe) return "stripe";
  if (s.premium_until === null) return "unlimited";
  // premium-trial-expiry only runs every 5 minutes -- a lapsed end date is already Free here.
  return Date.parse(s.premium_until) > now ? "trial" : "free";
}

/** A past end date on a Free student: their trial (or admin-set Pro) ran out, as opposed to never
 *  having had Pro, or an admin turning it off (which clears the date). */
export function trialEndedAt(s: ProFields, now: number): string | null {
  return proState(s, now) === "free" && s.premium_until !== null && Date.parse(s.premium_until) <= now
    ? s.premium_until
    : null;
}

export function formatTimeLeft(until: string, now: number): string {
  const ms = Date.parse(until) - now;
  if (ms < HOUR_MS) return "<1h left";
  if (ms < DAY_MS) return `${Math.ceil(ms / HOUR_MS)}h left`;
  return `${Math.ceil(ms / DAY_MS)}d left`;
}

export function endsWithin(until: string, now: number, days: number): boolean {
  return Date.parse(until) - now <= days * DAY_MS;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortKey = "pro" | "name" | "last_active" | "streak" | "reviews" | "new" | "practice" | "test" | "joined";
export type SortDir = "asc" | "desc";

const SORT_KEYS: SortKey[] = ["pro", "name", "last_active", "streak", "reviews", "new", "practice", "test", "joined"];

/** Direction a column starts in when first clicked: A-Z for names, biggest/latest first otherwise. */
export function defaultDir(key: SortKey): SortDir {
  return key === "name" ? "asc" : "desc";
}

function displayName(s: StudentRosterRow): string {
  return (s.display_name || s.email).toLowerCase();
}

/** Every key sorts as a number or string; null (never active, Free) sorts as the lowest value. */
function sortValue(s: StudentRosterRow, key: SortKey, now: number): number | string | null {
  switch (key) {
    case "pro": {
      const state = proState(s, now);
      if (state === "free") return null;
      return state === "trial" ? Date.parse(s.premium_until!) : Number.POSITIVE_INFINITY;
    }
    case "name":
      return displayName(s);
    case "last_active":
      return s.last_active_date;
    case "streak":
      return s.current_streak;
    case "reviews":
      // Same sum the Reviews column shows -- kana drill graduations count as reviews there.
      return s.reviews_count + s.learned_count;
    case "new":
      return s.new_cards_count;
    case "practice":
      return s.practice_count;
    case "test":
      return s.test_count;
    case "joined":
      return s.created_at;
  }
}

function compareValues(a: number | string | null, b: number | string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return a < b ? -1 : 1;
}

export function sortStudents(students: StudentRosterRow[], key: SortKey, dir: SortDir, now: number): StudentRosterRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...students].sort(
    (a, b) =>
      sign * compareValues(sortValue(a, key, now), sortValue(b, key, now)) ||
      displayName(a).localeCompare(displayName(b))
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type ProEndsFilter = "any" | "3d" | "7d" | "ended";
export type ActivityFilter = "any" | "today" | "7d" | "inactive7" | "inactive30" | "never";
export type JoinedFilter = "any" | "7d" | "30d" | "90d";
export type StreakFilter = "any" | "on" | "off";
export type StudyTrack = "kana" | "standard";

export interface RosterFilters {
  /** Empty = any plan. */
  plan: ProState[];
  proEnds: ProEndsFilter;
  activity: ActivityFilter;
  /** Empty = both regions. */
  region: Region[];
  joined: JoinedFilter;
  /** Empty = any track. */
  track: StudyTrack[];
  streak: StreakFilter;
  /** "" = any country, "none" = not set, otherwise an ISO code. */
  country: string;
}

export interface RosterView {
  query: string;
  sort: SortKey;
  dir: SortDir;
  filters: RosterFilters;
}

export const DEFAULT_FILTERS: RosterFilters = {
  plan: [],
  proEnds: "any",
  activity: "any",
  region: [],
  joined: "any",
  track: [],
  streak: "any",
  country: "",
};

const DEFAULT_SORT: SortKey = "last_active";

const PLANS: ProState[] = ["unlimited", "trial", "stripe", "free"];
const PRO_ENDS: ProEndsFilter[] = ["any", "3d", "7d", "ended"];
const ACTIVITIES: ActivityFilter[] = ["any", "today", "7d", "inactive7", "inactive30", "never"];
const REGIONS: Region[] = ["eu", "us"];
const JOINED: JoinedFilter[] = ["any", "7d", "30d", "90d"];
const TRACKS: StudyTrack[] = ["kana", "standard"];
const STREAKS: StreakFilter[] = ["any", "on", "off"];

export function activeFilterCount(f: RosterFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as (keyof RosterFilters)[]).filter((k) => {
    const value = f[k];
    return Array.isArray(value) ? value.length > 0 : value !== DEFAULT_FILTERS[k];
  }).length;
}

/** The admin's own local calendar day, as YYYY-MM-DD -- last_active_date is a plain date too. */
function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysSince(day: string, now: number): number {
  return Math.round((Date.parse(localDay(now)) - Date.parse(day)) / DAY_MS);
}

function matchesActivity(s: StudentRosterRow, filter: ActivityFilter, now: number): boolean {
  if (filter === "any") return true;
  if (filter === "never") return s.last_active_date === null;
  if (s.last_active_date === null) return false;
  const days = daysSince(s.last_active_date, now);
  switch (filter) {
    case "today":
      return days <= 0;
    case "7d":
      return days <= 6;
    case "inactive7":
      return days >= 7;
    case "inactive30":
      return days >= 30;
  }
}

function matchesProEnds(s: StudentRosterRow, filter: ProEndsFilter, now: number): boolean {
  if (filter === "any") return true;
  if (filter === "ended") return trialEndedAt(s, now) !== null;
  return proState(s, now) === "trial" && endsWithin(s.premium_until!, now, filter === "3d" ? 3 : 7);
}

function matchesQuery(s: StudentRosterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (s.display_name ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
}

export function filterStudents(students: StudentRosterRow[], view: RosterView, now: number): StudentRosterRow[] {
  const f = view.filters;
  return students.filter(
    (s) =>
      matchesQuery(s, view.query) &&
      (f.plan.length === 0 || f.plan.includes(proState(s, now))) &&
      matchesProEnds(s, f.proEnds, now) &&
      matchesActivity(s, f.activity, now) &&
      (f.region.length === 0 || (s.region !== null && f.region.includes(s.region))) &&
      (f.joined === "any" || now - Date.parse(s.created_at) <= Number.parseInt(f.joined) * DAY_MS) &&
      (f.track.length === 0 || (s.study_track !== null && f.track.includes(s.study_track))) &&
      (f.streak === "any" || (f.streak === "on" ? s.current_streak > 0 : s.current_streak === 0)) &&
      (f.country === "" || (f.country === "none" ? s.country === null : s.country === f.country))
  );
}

// ---------------------------------------------------------------------------
// URL <-> view -- everything but the defaults goes into the query string, so a reload or coming
// back from a student's detail page lands on the same list.
// ---------------------------------------------------------------------------

function one<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function many<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return allowed.filter((option) => value.split(",").includes(option));
}

export function parseView(params: URLSearchParams): RosterView {
  const sort = one(params.get("sort"), SORT_KEYS, DEFAULT_SORT);
  return {
    query: params.get("q") ?? "",
    sort,
    dir: one(params.get("dir"), ["asc", "desc"] as const, defaultDir(sort)),
    filters: {
      plan: many(params.get("plan"), PLANS),
      proEnds: one(params.get("ends"), PRO_ENDS, "any"),
      activity: one(params.get("activity"), ACTIVITIES, "any"),
      region: many(params.get("region"), REGIONS),
      joined: one(params.get("joined"), JOINED, "any"),
      track: many(params.get("track"), TRACKS),
      streak: one(params.get("streak"), STREAKS, "any"),
      country: params.get("country") ?? "",
    },
  };
}

export function serializeView(view: RosterView): string {
  const params = new URLSearchParams();
  const f = view.filters;
  if (view.query) params.set("q", view.query);
  if (view.sort !== DEFAULT_SORT) params.set("sort", view.sort);
  if (view.dir !== defaultDir(view.sort)) params.set("dir", view.dir);
  if (f.plan.length) params.set("plan", f.plan.join(","));
  if (f.proEnds !== "any") params.set("ends", f.proEnds);
  if (f.activity !== "any") params.set("activity", f.activity);
  if (f.region.length) params.set("region", f.region.join(","));
  if (f.joined !== "any") params.set("joined", f.joined);
  if (f.track.length) params.set("track", f.track.join(","));
  if (f.streak !== "any") params.set("streak", f.streak);
  if (f.country) params.set("country", f.country);
  return params.toString();
}
