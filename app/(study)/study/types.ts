import type { DueCard, NewKanjiCandidate, NewVocabCandidate, NewHiraganaCandidate, NewKatakanaCandidate } from "@/lib/types";

export type QueueItem =
  | { key: string; kind: "review"; card: DueCard }
  | { key: string; kind: "new_kanji"; candidate: NewKanjiCandidate }
  | { key: string; kind: "new_vocab"; candidate: NewVocabCandidate }
  | { key: string; kind: "new_hiragana"; candidate: NewHiraganaCandidate }
  | { key: string; kind: "new_katakana"; candidate: NewKatakanaCandidate };

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
