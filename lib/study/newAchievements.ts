const STORAGE_KEY_PREFIX = "vici_new_achievements";

// Scoped per user, same reasoning as lib/study/session.ts: a stale list from a previous account
// in the same tab must never leak into a different user's summary screen.
function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function readStored(userId: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = sessionStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Accumulates achievement keys unlocked during the current study session (queue.ts is the only
 * writer, from drill/review submits), carried across the hard navigation to /study/summary --
 * useStudyQueue's own React state doesn't survive that navigation since the two pages are
 * siblings, not parent/child (see endSession's router.push). */
export function addNewlyUnlockedAchievements(userId: string, keys: string[]): void {
  if (typeof window === "undefined" || keys.length === 0) return;
  const merged = Array.from(new Set([...readStored(userId), ...keys]));
  sessionStorage.setItem(storageKey(userId), JSON.stringify(merged));
}

/** Reads and clears the accumulated list -- meant to be called exactly once, on the summary
 * page's mount, so a later revisit/refresh of that page doesn't re-show the same unlocks. */
export function takeNewlyUnlockedAchievements(userId: string): string[] {
  const keys = readStored(userId);
  if (typeof window !== "undefined") sessionStorage.removeItem(storageKey(userId));
  return keys;
}
