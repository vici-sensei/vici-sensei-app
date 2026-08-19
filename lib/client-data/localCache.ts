/** Tiny stale-while-revalidate helper backing useUserProfile/useStudySettings: read the last
 *  known value synchronously (for instant paint) while the real fetch happens in the background. */

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function readCache<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage full or unavailable (private browsing) -- the cache is a pure optimization.
  }
}

export function clearCache(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
