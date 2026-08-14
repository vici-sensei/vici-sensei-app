import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";

const STORAGE_KEY = "browse:levels";

export function readStoredLevels(): JlptLevel[] {
  if (typeof window === "undefined") return [...JLPT_LEVELS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const levels = raw.split(",").filter((l): l is JlptLevel => (JLPT_LEVELS as readonly string[]).includes(l));
      if (levels.length > 0) return levels;
    }
  } catch {
    return [...JLPT_LEVELS];
  }
  // No usable value stored yet — default to every level and persist that default.
  writeStoredLevels([...JLPT_LEVELS]);
  return [...JLPT_LEVELS];
}

export function writeStoredLevels(levels: JlptLevel[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, levels.join(","));
  } catch {
    // ignore (private browsing / quota)
  }
}
