import { readCache, writeCache, clearCache } from "@/lib/client-data/localCache";
import type { DueCard } from "@/lib/types";

interface CachedFirstCard {
  card: DueCard;
  cachedAt: number;
}

// Generous on purpose -- a cached card is never trusted as-is, only shown for an instant
// before the real /study fetch (which always wins, see useStudyQueue) confirms or replaces
// it. This just bounds how long a genuinely stale entry can linger in localStorage.
const MAX_AGE_MS = 60 * 60 * 1000;

function cacheKey(userId: string): string {
  return `cache:first-due-card:${userId}`;
}

/** Instant-paint source for /study: read synchronously on mount, before any network call
 * has had a chance to resolve. Written by prefetchFirstDueCard() (hover/focus on a "Start
 * studying" entry point) and by useStudyQueue itself once the real fetch lands. */
export function readFirstCardCache(userId: string): DueCard | null {
  const cached = readCache<CachedFirstCard>(cacheKey(userId));
  if (!cached || Date.now() - cached.cachedAt > MAX_AGE_MS) return null;
  return cached.card;
}

export function writeFirstCardCache(userId: string, card: DueCard): void {
  writeCache<CachedFirstCard>(cacheKey(userId), { card, cachedAt: Date.now() });
}

export function clearFirstCardCache(userId: string): void {
  clearCache(cacheKey(userId));
}
