import type { StudyStats } from "@/lib/types";

export function cardsRemainingToday(stats: StudyStats): number {
  const remainingKanji = Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0);
  const remainingVocab = Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0);
  return stats.due_today + remainingKanji + remainingVocab;
}
