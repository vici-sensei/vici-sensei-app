import { readCache, writeCache, clearCache } from "@/lib/client-data/localCache";
import { ALL_PRACTICE_CATEGORIES, type PracticeCategory } from "./practiceCategories";

const PRACTICE_CARD_KINDS = ["hiragana", "katakana", "kanji_meaning", "kanji_reading", "vocab_meaning"] as const;
export type PracticeCardKind = (typeof PRACTICE_CARD_KINDS)[number];

export interface PracticeQueueCardRef {
  kind: PracticeCardKind;
  id: number;
}

export interface PracticeWrongCardRef extends PracticeQueueCardRef {
  /** What the user actually typed for this card, so the "done" summary can show it next to the
   * correct answer. Optional/defaulted to "" for caches written before this field existed. */
  userAnswer?: string;
}

export interface CachedPracticeQueue {
  /** The categories this pass was started with (see /study/practice's setup screen) -- read back
   * on resume so the deck is refetched/reconciled against the same pool the user picked, not
   * silently widened or narrowed by a since-changed remembered selection. */
  categories: PracticeCategory[];
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
  return typeof ref.id === "number" && (PRACTICE_CARD_KINDS as readonly string[]).includes(ref.kind as string);
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
    Array.isArray(cached.categories) &&
    cached.categories.length > 0 &&
    cached.categories.every((c) => (ALL_PRACTICE_CATEGORIES as string[]).includes(c)) &&
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
 * merged with newly-learned characters on read. Caches written before `categories` existed (kana
 * only, implicitly) are treated as stale and ignored -- see isValidCache. */
export function readPracticeQueueCache(userId: string): CachedPracticeQueue | null {
  const cached = readCache<unknown>(cacheKey(userId));
  return isValidCache(cached) ? cached : null;
}

export function writePracticeQueueCache(userId: string, state: CachedPracticeQueue): void {
  writeCache(cacheKey(userId), state);
}

export function clearPracticeQueueCache(userId: string): void {
  clearCache(cacheKey(userId));
}
