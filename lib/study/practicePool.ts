import type { PracticeKanjiMeaningCard, PracticeKanjiReadingCard } from "@/lib/data/kanjiPractice";
import type { PracticeVocabCard } from "@/lib/data/vocabPractice";

export interface PracticeKanaPoolCard {
  kind: "hiragana" | "katakana";
  id: number;
  character: string;
  romaji: string;
  /** See lib/data/kanaPractice.ts's PracticeKanaCard.bonus. */
  bonus: boolean;
}

/** Every kind of card /study/practice's free-practice mode can shuffle into a deck, tagged by
 * `kind` so cardKey/toDueCard (usePracticeQueue.ts) and the cross-refresh caches
 * (practiceQueueCache.ts, practiceSummaryCache.ts) can branch and dedupe without re-deriving
 * exercise_type from scratch. */
export type PracticePoolCard = PracticeKanaPoolCard | PracticeKanjiMeaningCard | PracticeKanjiReadingCard | PracticeVocabCard;

export function practiceCardKey(item: Pick<PracticePoolCard, "kind" | "id">): string {
  return `${item.kind}-${item.id}`;
}

/** A pool card the user answered incorrectly during a pass, plus what they actually typed --
 * shown on the "done" summary, and re-shuffled into a fresh queue by Retry. Carries the full
 * card content (not just its id) so both the mid-pass summary and the indefinitely-cached
 * finished-pass summary (practiceSummaryCache.ts) can render/retry it without needing the
 * original deck fetch still in memory. */
export type PracticeMissedCard = PracticePoolCard & { userAnswer: string };
