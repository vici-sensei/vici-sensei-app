import { JLPT_LEVELS } from "@/lib/srs/constants";

const STORAGE_KEY = "browse:levels";

// Browse-only pseudo-level for kanji/vocabulary rows with no JLPT classification (level/jlpt_level
// IS NULL in the DB) -- words and kanji harder or rarer than N1. Not part of JLPT_LEVELS since that
// type also drives SRS settings (enabled_levels, onboarding, level-up), which don't have this tier.
export const BEYOND_N1_LEVEL = ">N1" as const;
export const BROWSE_LEVELS = [...JLPT_LEVELS, BEYOND_N1_LEVEL] as const;
export type BrowseLevel = (typeof BROWSE_LEVELS)[number];

export function readStoredLevels(): BrowseLevel[] {
  if (typeof window === "undefined") return [...BROWSE_LEVELS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const levels = raw.split(",").filter((l): l is BrowseLevel => (BROWSE_LEVELS as readonly string[]).includes(l));
      if (levels.length > 0) return levels;
    }
  } catch {
    return [...BROWSE_LEVELS];
  }
  // No usable value stored yet — default to every level (including >N1) and persist that default.
  writeStoredLevels([...BROWSE_LEVELS]);
  return [...BROWSE_LEVELS];
}

export function writeStoredLevels(levels: BrowseLevel[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, levels.join(","));
  } catch {
    // ignore (private browsing / quota)
  }
}

export function clearStoredLevels() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore (private browsing / quota)
  }
}
