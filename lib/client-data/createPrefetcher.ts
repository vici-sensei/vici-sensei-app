const DEFAULT_COOLDOWN_MS = 5_000;

/** Wraps a fire-and-forget prefetch function with an in-flight guard and a cooldown, so
 * repeated hovers (or several visible entry points for the same target) don't spam requests.
 * Errors are swallowed -- prefetches are best-effort, the real fetch on the destination page
 * is always authoritative regardless of whether this lands. */
export function createPrefetcher<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
  cooldownMs = DEFAULT_COOLDOWN_MS
): (...args: Args) => void {
  let inFlight = false;
  let lastRunAt = 0;

  return (...args: Args) => {
    if (inFlight || Date.now() - lastRunAt < cooldownMs) return;
    inFlight = true;

    void fn(...args)
      .catch(() => {
        // Best-effort -- the destination page's own fetch is authoritative.
      })
      .finally(() => {
        inFlight = false;
        lastRunAt = Date.now();
      });
  };
}

/** Same guard as createPrefetcher, but keyed -- for prefetchers with many independent targets
 * (e.g. one per row in a list) where an in-flight/cooldown fetch for one key must not block a
 * different key, only repeats of the *same* key. */
export function createKeyedPrefetcher<Key, Args extends unknown[]>(
  fn: (key: Key, ...args: Args) => Promise<void>,
  cooldownMs = DEFAULT_COOLDOWN_MS
): (key: Key, ...args: Args) => void {
  const inFlight = new Set<Key>();
  const lastRunAt = new Map<Key, number>();

  return (key: Key, ...args: Args) => {
    if (inFlight.has(key) || Date.now() - (lastRunAt.get(key) ?? 0) < cooldownMs) return;
    inFlight.add(key);

    void fn(key, ...args)
      .catch(() => {
        // Best-effort -- the destination page's own fetch is authoritative.
      })
      .finally(() => {
        inFlight.delete(key);
        lastRunAt.set(key, Date.now());
      });
  };
}
