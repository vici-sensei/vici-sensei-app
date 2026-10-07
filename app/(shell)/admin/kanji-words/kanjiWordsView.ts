import type { KanjiWordsRow, KanjiWordTuple } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const KANJI_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

function levelRank(level: string | null): number {
  const i = KANJI_LEVELS.indexOf(level as (typeof KANJI_LEVELS)[number]);
  return i === -1 ? KANJI_LEVELS.length : i;
}

// ---------------------------------------------------------------------------
// Which list a row is judged on
// ---------------------------------------------------------------------------

/** The list the content filters look at: what students see now, or -- with the "algorithm's list"
 *  switch -- what the algorithm picked (`a` is null when it is the same as `f`). */
export function wordsOf(row: KanjiWordsRow, onAlgo: boolean): KanjiWordTuple[] {
  return onAlgo ? (row.a ?? row.f) : row.f;
}

export function maxGap(words: KanjiWordTuple[]): number {
  return words.reduce((max, w) => Math.max(max, w[3]), Number.NEGATIVE_INFINITY);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type GapFilter = 0 | 1 | 2 | 3;
export type CountBucket = "0" | "1" | "2" | "3" | "4plus" | "over5";
export type WordKind = "nolevel" | "uncommon";
export type ChangedFilter = "any" | "modified" | "untouched" | "gained" | "lost";
export type ReviewFilter = "any" | "reviewed" | "unreviewed" | "recheck";
export type RecentFilter = "any" | "1d" | "7d";

export interface KanjiFilters {
  /** Judge the content filters on the algorithm's own list instead of the current one. */
  onAlgo: boolean;
  /** At least one word whose level is this many steps above the kanji's (0 = no filter). */
  gap: GapFilter;
  /** Empty = any kanji level. */
  levels: string[];
  /** Empty = any number of words. */
  counts: CountBucket[];
  /** Empty = no filter; otherwise the list has at least one word of ANY chosen kind. */
  wordKinds: WordKind[];
  changed: ChangedFilter;
  review: ReviewFilter;
  recent: RecentFilter;
  /** Last change made by one of these admins (emails). Empty = anyone. */
  admins: string[];
}

export const DEFAULT_FILTERS: KanjiFilters = {
  onAlgo: false,
  gap: 0,
  levels: [],
  counts: [],
  wordKinds: [],
  changed: "any",
  review: "any",
  recent: "any",
  admins: [],
};

export function activeFilterCount(f: KanjiFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as (keyof KanjiFilters)[]).filter((k) => {
    const value = f[k];
    return Array.isArray(value) ? value.length > 0 : value !== DEFAULT_FILTERS[k];
  }).length;
}

function matchesCount(n: number, bucket: CountBucket): boolean {
  switch (bucket) {
    case "0":
      return n === 0;
    case "1":
      return n === 1;
    case "2":
      return n === 2;
    case "3":
      return n === 3;
    case "4plus":
      return n >= 4;
    case "over5":
      return n > 5;
  }
}

/** Kana readings are stored like "ひ.る" / "-か"; the dots and dashes only mark okurigana and affixes. */
function bareReading(reading: string): string {
  return reading.replace(/[.\-]/g, "");
}

function matchesQuery(row: KanjiWordsRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.k.includes(q) ||
    row.m.some((m) => m.toLowerCase().includes(q)) ||
    row.kun.some((r) => bareReading(r).includes(q)) ||
    row.on.some((r) => bareReading(r).includes(q)) ||
    row.f.some((w) => w[1].includes(q)) ||
    (row.a?.some((w) => w[1].includes(q)) ?? false)
  );
}

function matchesChanged(row: KanjiWordsRow, filter: ChangedFilter): boolean {
  if (filter === "any") return true;
  if (filter === "untouched") return row.a === null;
  if (filter === "modified") return row.a !== null;
  if (row.a === null) return false;
  const finalIds = new Set(row.f.map((w) => w[0]));
  const algoIds = new Set(row.a.map((w) => w[0]));
  return filter === "gained" ? row.f.some((w) => !algoIds.has(w[0])) : row.a.some((w) => !finalIds.has(w[0]));
}

export function filterKanji(rows: KanjiWordsRow[], view: KanjiView, now: number): KanjiWordsRow[] {
  const f = view.filters;
  return rows.filter((row) => {
    if (!matchesQuery(row, view.query)) return false;
    if (f.levels.length > 0 && !f.levels.includes(row.lv ?? "")) return false;
    const words = wordsOf(row, f.onAlgo);
    if (f.gap > 0 && !words.some((w) => w[3] >= f.gap)) return false;
    if (f.counts.length > 0 && !f.counts.some((bucket) => matchesCount(words.length, bucket))) return false;
    if (
      f.wordKinds.length > 0 &&
      !f.wordKinds.some((kind) => words.some((w) => (kind === "nolevel" ? w[2] === null : !w[4])))
    ) {
      return false;
    }
    if (!matchesChanged(row, f.changed)) return false;
    if (f.review === "reviewed" && !row.r) return false;
    if (f.review === "unreviewed" && row.r) return false;
    if (f.review === "recheck" && !row.ac) return false;
    if (f.recent !== "any") {
      if (!row.lu || now - Date.parse(row.lu) > (f.recent === "1d" ? 1 : 7) * DAY_MS) return false;
    }
    if (f.admins.length > 0 && !(row.lb !== null && f.admins.includes(row.lb))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortKey = "level" | "gap" | "words" | "changed";
export type SortDir = "asc" | "desc";

const SORT_KEYS: SortKey[] = ["level", "gap", "words", "changed"];

export const SORT_LABELS: Record<SortKey, string> = {
  level: "Level, then app order",
  gap: "Biggest level gap",
  words: "Number of words",
  changed: "Last changed",
};

/** N5 first for the natural order; the biggest / latest first for everything else. */
export function defaultDir(key: SortKey): SortDir {
  return key === "level" ? "asc" : "desc";
}

function sortValue(row: KanjiWordsRow, key: SortKey, onAlgo: boolean): number {
  switch (key) {
    case "level":
      return levelRank(row.lv);
    case "gap": {
      const gap = maxGap(wordsOf(row, onAlgo));
      return Number.isFinite(gap) ? gap : -99;
    }
    case "words":
      return wordsOf(row, onAlgo).length;
    case "changed":
      return row.lu ? Date.parse(row.lu) : 0;
  }
}

/** Ties always fall back to the order students meet the kanji in: level, then id. */
export function sortKanji(rows: KanjiWordsRow[], key: SortKey, dir: SortDir, onAlgo: boolean): KanjiWordsRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      sign * (sortValue(a, key, onAlgo) - sortValue(b, key, onAlgo)) ||
      levelRank(a.lv) - levelRank(b.lv) ||
      a.id - b.id
  );
}

// ---------------------------------------------------------------------------
// View <-> URL, so a reload (or the Back button) lands on the same list and the same kanji.
// ---------------------------------------------------------------------------

export interface KanjiView {
  query: string;
  sort: SortKey;
  dir: SortDir;
  filters: KanjiFilters;
}

const GAPS: GapFilter[] = [0, 1, 2, 3];
const COUNTS: CountBucket[] = ["0", "1", "2", "3", "4plus", "over5"];
const KINDS: WordKind[] = ["nolevel", "uncommon"];
const CHANGED: ChangedFilter[] = ["any", "modified", "untouched", "gained", "lost"];
const REVIEWS: ReviewFilter[] = ["any", "reviewed", "unreviewed", "recheck"];
const RECENTS: RecentFilter[] = ["any", "1d", "7d"];
const DEFAULT_SORT: SortKey = "level";

function one<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function many<T extends string>(value: string | null, allowed: readonly T[]): T[] {
  if (!value) return [];
  return allowed.filter((option) => value.split(",").includes(option));
}

export function parseView(params: URLSearchParams): { view: KanjiView; selected: number | null } {
  const sort = one(params.get("sort"), SORT_KEYS, DEFAULT_SORT);
  const gap = Number.parseInt(params.get("gap") ?? "0", 10);
  const selected = Number.parseInt(params.get("k") ?? "", 10);
  return {
    selected: Number.isFinite(selected) ? selected : null,
    view: {
      query: params.get("q") ?? "",
      sort,
      dir: one(params.get("dir"), ["asc", "desc"] as const, defaultDir(sort)),
      filters: {
        onAlgo: params.get("algo") === "1",
        gap: GAPS.includes(gap as GapFilter) ? (gap as GapFilter) : 0,
        levels: many(params.get("lv"), KANJI_LEVELS),
        counts: many(params.get("cnt"), COUNTS),
        wordKinds: many(params.get("kind"), KINDS),
        changed: one(params.get("chg"), CHANGED, "any"),
        review: one(params.get("rev"), REVIEWS, "any"),
        recent: one(params.get("rec"), RECENTS, "any"),
        admins: (params.get("by") ?? "").split(",").filter(Boolean),
      },
    },
  };
}

export function serializeView(view: KanjiView, selected: number | null): string {
  const params = new URLSearchParams();
  const f = view.filters;
  if (selected !== null) params.set("k", String(selected));
  if (view.query) params.set("q", view.query);
  if (view.sort !== DEFAULT_SORT) params.set("sort", view.sort);
  if (view.dir !== defaultDir(view.sort)) params.set("dir", view.dir);
  if (f.onAlgo) params.set("algo", "1");
  if (f.gap > 0) params.set("gap", String(f.gap));
  if (f.levels.length) params.set("lv", f.levels.join(","));
  if (f.counts.length) params.set("cnt", f.counts.join(","));
  if (f.wordKinds.length) params.set("kind", f.wordKinds.join(","));
  if (f.changed !== "any") params.set("chg", f.changed);
  if (f.review !== "any") params.set("rev", f.review);
  if (f.recent !== "any") params.set("rec", f.recent);
  if (f.admins.length) params.set("by", f.admins.join(","));
  return params.toString();
}
