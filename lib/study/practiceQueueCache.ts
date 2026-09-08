import { readCache, writeCache, clearCache } from "@/lib/client-data/localCache";

export interface PracticeQueueCardRef {
  id: number;
  script: "hiragana" | "katakana";
}

export interface CachedPracticeQueue {
  order: PracticeQueueCardRef[];
  index: number;
  correct: number;
}

function cacheKey(userId: string): string {
  return `cache:practice-queue:${userId}`;
}

function isCardRef(value: unknown): value is PracticeQueueCardRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return typeof ref.id === "number" && (ref.script === "hiragana" || ref.script === "katakana");
}

function isValidCache(value: unknown): value is CachedPracticeQueue {
  if (!value || typeof value !== "object") return false;
  const cached = value as Record<string, unknown>;
  return (
    Array.isArray(cached.order) &&
    cached.order.every(isCardRef) &&
    typeof cached.index === "number" &&
    typeof cached.correct === "number"
  );
}

/** Resume state for /study/practice's free-practice pass, so leaving mid-deck and coming back
 * (refresh, closing the tab) picks up where the user left off instead of reshuffling from
 * scratch. Same-browser only -- see usePracticeQueue's reconcileQueue for how a cached queue is
 * merged with newly-learned characters on read. */
export function readPracticeQueueCache(userId: string): CachedPracticeQueue | null {
  const cached = readCache<unknown>(cacheKey(userId));
  return isValidCache(cached) ? cached : null;
}

export function writePracticeQueueCache(userId: string, state: CachedPracticeQueue): void {
  writeCache<CachedPracticeQueue>(cacheKey(userId), state);
}

export function clearPracticeQueueCache(userId: string): void {
  clearCache(cacheKey(userId));
}
