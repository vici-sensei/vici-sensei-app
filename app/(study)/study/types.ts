import type { DueCard, NewKanjiCandidate, NewVocabCandidate } from "@/lib/types";

export type QueueItem =
  | { key: string; kind: "review"; card: DueCard }
  | { key: string; kind: "new_kanji"; candidate: NewKanjiCandidate }
  | { key: string; kind: "new_vocab"; candidate: NewVocabCandidate };

export function reviewKey(card: DueCard): string {
  return `review-${card.exercise_type}-${card.progress_id}`;
}

export function newKanjiKey(id: number): string {
  return `new_kanji-${id}`;
}

export function newVocabKey(id: number): string {
  return `new_vocab-${id}`;
}
