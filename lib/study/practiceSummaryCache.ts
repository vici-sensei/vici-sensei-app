import { readCache, writeCache, clearCache } from "@/lib/client-data/localCache";
import { ALL_PRACTICE_CATEGORIES, type PracticeCategory } from "./practiceCategories";
import type { PracticeMissedCard } from "./practicePool";

export interface CachedPracticeSummary {
  categories: PracticeCategory[];
  correct: number;
  total: number;
  wrongAnswers: PracticeMissedCard[];
  activeMs: number;
}

function cacheKey(userId: string): string {
  return `cache:practice-summary:${userId}`;
}

function isValid(value: unknown): value is CachedPracticeSummary {
  if (!value || typeof value !== "object") return false;
  const cached = value as Record<string, unknown>;
  return (
    Array.isArray(cached.categories) &&
    cached.categories.length > 0 &&
    cached.categories.every((c) => (ALL_PRACTICE_CATEGORIES as string[]).includes(c)) &&
    typeof cached.correct === "number" &&
    typeof cached.total === "number" &&
    Array.isArray(cached.wrongAnswers) &&
    typeof cached.activeMs === "number"
  );
}

/** The "done" screen's result for the free-practice pass the user most recently finished on
 * /study/practice -- kept indefinitely (no expiry, survives closing the tab and coming back days
 * later) so a refresh, or simply reopening the page, shows the exact same summary instead of
 * silently starting a new pass. Only cleared by an explicit choice on that screen: retrying the
 * missed cards or starting a new practice (see usePracticeQueue's retryMistakes/startNewPractice)
 * -- leaving via "Home" deliberately does NOT clear it, so coming back to /study/practice later
 * still shows the same finished summary until the user actually picks one of those two. */
export function readPracticeSummaryCache(userId: string): CachedPracticeSummary | null {
  const cached = readCache<unknown>(cacheKey(userId));
  return isValid(cached) ? cached : null;
}

export function writePracticeSummaryCache(userId: string, summary: CachedPracticeSummary): void {
  writeCache(cacheKey(userId), summary);
}

export function clearPracticeSummaryCache(userId: string): void {
  clearCache(cacheKey(userId));
}
