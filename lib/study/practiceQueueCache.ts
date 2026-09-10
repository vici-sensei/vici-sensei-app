import { readCache, writeCache, clearCache } from "@/lib/client-data/localCache";

export interface PracticeQueueCardRef {
  id: number;
  script: "hiragana" | "katakana";
}

export interface PracticeWrongCardRef extends PracticeQueueCardRef {
  /** What the user actually typed for this card, so the "done" summary can show it next to the
   * correct answer. Optional/defaulted to "" for caches written before this field existed. */
  userAnswer?: string;
}

export interface CachedPracticeQueue {
  order: PracticeQueueCardRef[];
  index: number;
  correct: number;
  /** Cards rated incorrect so far this pass, in the order they were answered -- so refreshing
   * mid-deck doesn't lose the list of misses the summary shows at the end. Optional so caches
   * written before this field existed still validate. */
  wrong?: PracticeWrongCardRef[];
  /** Milliseconds of screen-on time spent on /study/practice so far this pass (see
   * usePracticeQueue's timer effect) -- excludes time the tab was hidden/backgrounded, so a
   * refresh resumes the running total instead of losing it. Optional for the same reason as
   * `wrong`. */
  activeMs?: number;
}

function cacheKey(userId: string): string {
  return `cache:practice-queue:${userId}`;
}

function isCardRef(value: unknown): value is PracticeQueueCardRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;
  return typeof ref.id === "number" && (ref.script === "hiragana" || ref.script === "katakana");
}

function isWrongRef(value: unknown): value is PracticeWrongCardRef {
  if (!isCardRef(value)) return false;
  const userAnswer = (value as unknown as Record<string, unknown>).userAnswer;
  return userAnswer === undefined || typeof userAnswer === "string";
}

function isValidCache(value: unknown): value is CachedPracticeQueue {
  if (!value || typeof value !== "object") return false;
  const cached = value as Record<string, unknown>;
  return (
    Array.isArray(cached.order) &&
    cached.order.every(isCardRef) &&
    typeof cached.index === "number" &&
    typeof cached.correct === "number" &&
    (cached.wrong === undefined || (Array.isArray(cached.wrong) && cached.wrong.every(isWrongRef))) &&
    (cached.activeMs === undefined || typeof cached.activeMs === "number")
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
