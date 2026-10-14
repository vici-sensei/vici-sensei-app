import type { AdminWordRow } from "@/lib/types";
import { manyOf, oneOf } from "@/lib/urlParams";

// ---------------------------------------------------------------------------
// Entries -- a word plus what the list needs over and over, worked out once per load
// ---------------------------------------------------------------------------

export interface WordEntry {
  row: AdminWordRow;
  /** The primary meanings, joined: what the Meaning column shows after the short meaning. */
  primaryText: string;
  /** Lower-cased word, kana reading, romaji and every short/primary meaning: what the search box looks in. */
  terms: string[];
  /** Place in the whole dictionary sorted by reading / by first meaning. Comparing two numbers is what keeps
   *  re-sorting 17k words on every keystroke fast; a collator compare per pair is not. */
  readingRank: number;
  meaningRank: number;
}

// Kana in gojuuon order (a, i, u, e, o, ka...) -- a plain string compare would put every katakana word after
// every hiragana one.
const collator = new Intl.Collator("ja");

function readingKey(row: AdminWordRow): string {
  return row.kana_reading ?? row.word;
}

function meaningKey(row: AdminWordRow): string {
  return (row.short_meaning?.trim() || row.primary_meanings?.[0] || "").toLowerCase();
}

/** Each row's 0-based place when all rows are ordered by `compare`. */
function ranks(rows: AdminWordRow[], compare: (a: AdminWordRow, b: AdminWordRow) => number): Map<AdminWordRow, number> {
  return new Map([...rows].sort(compare).map((row, i) => [row, i]));
}

export function toEntries(rows: AdminWordRow[]): WordEntry[] {
  const byReading = ranks(rows, (a, b) => collator.compare(readingKey(a), readingKey(b)) || a.id - b.id);
  const byMeaning = ranks(rows, (a, b) => meaningKey(a).localeCompare(meaningKey(b)) || a.id - b.id);
  return rows.map((row) => {
    const meanings = [row.short_meaning?.trim() ?? "", ...(row.primary_meanings ?? [])].filter(Boolean);
    return {
      row,
      primaryText: (row.primary_meanings ?? []).join(", "),
      terms: [row.word, row.kana_reading ?? "", row.romaji_reading ?? "", ...meanings]
        .filter(Boolean)
        .map((term) => term.toLowerCase()),
      readingRank: byReading.get(row)!,
      meaningRank: byMeaning.get(row)!,
    };
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortKey = "word" | "meaning" | "level" | "frequency" | "id";
export type SortDir = "asc" | "desc";

const SORT_KEYS: SortKey[] = ["word", "meaning", "level", "frequency", "id"];

/** Direction a column starts in when first clicked: most common first for frequency, A-Z / N5-first otherwise. */
export function defaultDir(key: SortKey): SortDir {
  return key === "frequency" ? "desc" : "asc";
}

const LEVEL_ORDER: Record<string, number> = { N5: 0, N4: 1, N3: 2, N2: 3, N1: 4 };

/** A word with no level / no frequency sorts last whichever way its column is sorted. */
function isMissing(e: WordEntry, key: SortKey): boolean {
  if (key === "level") return LEVEL_ORDER[e.row.jlpt_level ?? ""] === undefined;
  if (key === "frequency") return e.row.frequency_number === null;
  return false;
}

/** Ascending order of two entries by one column, both having a value for it. */
function compareBy(a: WordEntry, b: WordEntry, key: SortKey): number {
  switch (key) {
    case "word":
      return a.readingRank - b.readingRank;
    case "meaning":
      return a.meaningRank - b.meaningRank;
    case "level":
      return (LEVEL_ORDER[a.row.jlpt_level ?? ""] ?? 0) - (LEVEL_ORDER[b.row.jlpt_level ?? ""] ?? 0);
    case "frequency":
      return (a.row.frequency_number ?? 0) - (b.row.frequency_number ?? 0);
    case "id":
      return a.row.id - b.row.id;
  }
}

function compareColumn(a: WordEntry, b: WordEntry, key: SortKey, sign: number): number {
  const aMissing = isMissing(a, key);
  const bMissing = isMissing(b, key);
  if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
  return sign * compareBy(a, b, key);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type LevelFilter = "N5" | "N4" | "N3" | "N2" | "N1" | "none";
export type YesNoFilter = "any" | "yes" | "no";

export interface WordFilters {
  /** Empty = every level. "none" = words without a JLPT level. */
  levels: LevelFilter[];
  study: YesNoFilter;
  common: YesNoFilter;
  usuallyKana: YesNoFilter;
  shortMeaning: YesNoFilter;
  /** "" = any part of speech, otherwise one exact parts_of_speech value. */
  pos: string;
}

export interface WordsView {
  query: string;
  sort: SortKey;
  dir: SortDir;
  filters: WordFilters;
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: WordFilters = {
  levels: [],
  study: "any",
  common: "any",
  usuallyKana: "any",
  shortMeaning: "any",
  pos: "",
};

const DEFAULT_SORT: SortKey = "level";

const LEVELS: LevelFilter[] = ["N5", "N4", "N3", "N2", "N1", "none"];
const YES_NO: YesNoFilter[] = ["any", "yes", "no"];

export function activeFilterCount(f: WordFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as (keyof WordFilters)[]).filter((k) => {
    const value = f[k];
    return Array.isArray(value) ? value.length > 0 : value !== DEFAULT_FILTERS[k];
  }).length;
}

function matchesYesNo(value: boolean | null, filter: YesNoFilter): boolean {
  return filter === "any" || (filter === "yes") === Boolean(value);
}

function matchesFilters(r: AdminWordRow, f: WordFilters): boolean {
  return (
    (f.levels.length === 0 || f.levels.includes((r.jlpt_level ?? "none") as LevelFilter)) &&
    matchesYesNo(r.study_enabled, f.study) &&
    matchesYesNo(r.is_common_jisho, f.common) &&
    matchesYesNo(r.usually_kana, f.usuallyKana) &&
    matchesYesNo(Boolean(r.short_meaning?.trim()), f.shortMeaning) &&
    (f.pos === "" || (r.parts_of_speech ?? []).includes(f.pos))
  );
}

/** How well a word matches the search: 0 = a term is exactly the query, 1 = a term starts with it,
 *  2 = a term contains it, null = no match. */
function matchTier(terms: string[], q: string): number | null {
  let best: number | null = null;
  for (const term of terms) {
    if (term === q) return 0;
    if (term.startsWith(q)) best = 1;
    else if (best === null && term.includes(q)) best = 2;
  }
  return best;
}

/** The words the view shows, in order. With a search, exact matches come first, then words starting with it,
 *  then the rest -- each group in the chosen column's order. Ties fall back to the reading. */
export function visibleEntries(entries: WordEntry[], view: WordsView): WordEntry[] {
  const q = view.query.trim().toLowerCase();
  const tiers = new Map<WordEntry, number>();
  const matching = entries.filter((e) => {
    if (!matchesFilters(e.row, view.filters)) return false;
    if (!q) return true;
    const tier = matchTier(e.terms, q);
    if (tier === null) return false;
    tiers.set(e, tier);
    return true;
  });
  const sign = view.dir === "asc" ? 1 : -1;
  return matching.sort(
    (a, b) =>
      (tiers.get(a) ?? 0) - (tiers.get(b) ?? 0) ||
      compareColumn(a, b, view.sort, sign) ||
      a.readingRank - b.readingRank
  );
}

/** Every part of speech in the dictionary, most used first, with how many words have it. */
export function partOfSpeechOptions(entries: WordEntry[]): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const pos of e.row.parts_of_speech ?? []) counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// ---------------------------------------------------------------------------
// URL <-> view -- everything but the defaults goes into the query string, so a reload lands on the same list.
// ---------------------------------------------------------------------------

export function parseView(params: URLSearchParams): WordsView {
  const sort = oneOf(params.get("sort"), SORT_KEYS, DEFAULT_SORT);
  const page = Number.parseInt(params.get("page") ?? "", 10);
  return {
    query: params.get("q") ?? "",
    sort,
    dir: oneOf(params.get("dir"), ["asc", "desc"] as const, defaultDir(sort)),
    filters: {
      levels: manyOf(params.get("level"), LEVELS),
      study: oneOf(params.get("study"), YES_NO, "any"),
      common: oneOf(params.get("common"), YES_NO, "any"),
      usuallyKana: oneOf(params.get("kana"), YES_NO, "any"),
      shortMeaning: oneOf(params.get("short"), YES_NO, "any"),
      pos: params.get("pos") ?? "",
    },
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function serializeView(view: WordsView): string {
  const params = new URLSearchParams();
  const f = view.filters;
  if (view.query) params.set("q", view.query);
  if (view.sort !== DEFAULT_SORT) params.set("sort", view.sort);
  if (view.dir !== defaultDir(view.sort)) params.set("dir", view.dir);
  if (f.levels.length) params.set("level", f.levels.join(","));
  if (f.study !== "any") params.set("study", f.study);
  if (f.common !== "any") params.set("common", f.common);
  if (f.usuallyKana !== "any") params.set("kana", f.usuallyKana);
  if (f.shortMeaning !== "any") params.set("short", f.shortMeaning);
  if (f.pos) params.set("pos", f.pos);
  if (view.page > 1) params.set("page", String(view.page));
  return params.toString();
}
