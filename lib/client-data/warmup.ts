import { readCache, writeCache } from "@/lib/client-data/localCache";
import { runWhenIdleSequence } from "@/lib/runWhenIdle";
import { prefetchFirstDueCard } from "@/lib/client-data/study";
import { prefetchProgressSummary } from "@/lib/client-data/progress";
import { prefetchLeaderboard } from "@/lib/client-data/leaderboard";
import { prefetchKanjiList } from "@/lib/client-data/kanji";
import { prefetchVocabularyList } from "@/lib/client-data/vocabulary";

// Skip re-running the whole warm-up if the last one finished recently -- none of what it
// fetches changes fast enough to be worth a fresh network round trip on every app open, and
// each prefetch's destination page always does its own authoritative refetch regardless of
// what's sitting in this cache. Hover/focus/touch on nav entries (see NavBar) still refreshes
// each one individually at any time, warm-up or not.
const FRESH_MS = 5 * 60 * 1000;

function warmupCacheKey(userId: string): string {
  return `cache:warmup-last-run:${userId}`;
}

/** Warms every route's localStorage cache once per app open, staggered one idle period apart
 * so the burst of requests doesn't compete with whatever the landing page itself still needs
 * to fetch. Called once from the shell layout (which stays mounted for the whole session), so
 * this only ever fires again on a fresh page load -- see FRESH_MS for why even that's often
 * skipped. Returns a cancel function for effect cleanup. */
export function runGlobalWarmup(userId: string): () => void {
  const lastRun = readCache<number>(warmupCacheKey(userId));
  if (lastRun != null && Date.now() - lastRun < FRESH_MS) return () => {};

  return runWhenIdleSequence([
    () => prefetchFirstDueCard(userId),
    () => prefetchProgressSummary(userId),
    () => prefetchLeaderboard(userId),
    () => prefetchKanjiList(),
    () => prefetchVocabularyList(),
    () => writeCache(warmupCacheKey(userId), Date.now()),
  ]);
}
