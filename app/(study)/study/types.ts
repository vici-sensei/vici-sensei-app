import type {
  DueCard,
  NewKanjiCandidate,
  NewVocabCandidate,
  NewHiraganaCandidate,
  NewKatakanaCandidate,
  NewHiraganaRuleCandidate,
  NewKatakanaRuleCandidate,
} from "@/lib/types";

export type QueueItem =
  | {
      key: string;
      kind: "review";
      card: DueCard;
      /** React render key, only ever set when it must differ from `key` (see
       * submitDrillAnswer's held-card retry in useStudyQueue.ts): a drill card that's answered
       * wrong and reshown -- with nothing else rendered in between, since it never left `queue`
       * -- needs a fresh key each time so React remounts ReviewCardKanaReading instead of
       * reusing the previous attempt's stale typed-answer state. `key` itself stays the stable
       * reviewKey(card) throughout, since that's what dedup/pool-membership checks compare
       * against. Falls back to `key` when unset. */
      renderKey?: string;
      /** Set only when this card is a sibling word/reading resolved after a "Vocabulary"/"Word
       * reading" review confirmed it along the way (see resolveConfirmedSiblings in
       * lib/data/reviews.ts) -- already known correct, so it renders via ReviewCardRateSibling
       * (straight to the rating step, no typing) instead of the normal typed review card. Its own
       * review gets linked back to the review that surfaced it via
       * review_logs.triggered_by_review_log_id (see useStudyQueue's rateSibling). */
      triggeredByReviewLogId?: number;
    }
  | { key: string; kind: "new_kanji"; candidate: NewKanjiCandidate }
  | { key: string; kind: "new_vocab"; candidate: NewVocabCandidate }
  | { key: string; kind: "new_hiragana"; candidate: NewHiraganaCandidate }
  | { key: string; kind: "new_katakana"; candidate: NewKatakanaCandidate }
  | { key: string; kind: "new_hiragana_rule"; candidate: NewHiraganaRuleCandidate }
  | { key: string; kind: "new_katakana_rule"; candidate: NewKatakanaRuleCandidate };

export function reviewKey(card: DueCard): string {
  return `review-${card.exercise_type}-${card.progress_id}`;
}

export function newKanjiKey(id: number): string {
  return `new_kanji-${id}`;
}

export function newVocabKey(id: number): string {
  return `new_vocab-${id}`;
}

export function newHiraganaKey(id: number): string {
  return `new_hiragana-${id}`;
}

export function newKatakanaKey(id: number): string {
  return `new_katakana-${id}`;
}

export function newHiraganaRuleKey(id: number): string {
  return `new_hiragana_rule-${id}`;
}

export function newKatakanaRuleKey(id: number): string {
  return `new_katakana_rule-${id}`;
}
