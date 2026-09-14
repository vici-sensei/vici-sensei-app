import { readCache, writeCache } from "@/lib/client-data/localCache";
import { ALL_PRACTICE_CATEGORIES, type PracticeCategory } from "./practiceCategories";

function cacheKey(userId: string): string {
  return `cache:practice-categories:${userId}`;
}

function isValid(value: unknown): value is PracticeCategory[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => (ALL_PRACTICE_CATEGORIES as string[]).includes(v));
}

/** Remembers the categories the user last actually started a /study/practice pass with, so
 * reopening the picker later preselects the same choice instead of starting blank every time. */
export function readPracticeCategoriesCache(userId: string): PracticeCategory[] | null {
  const cached = readCache<unknown>(cacheKey(userId));
  return isValid(cached) ? cached : null;
}

export function writePracticeCategoriesCache(userId: string, categories: PracticeCategory[]): void {
  writeCache(cacheKey(userId), categories);
}
