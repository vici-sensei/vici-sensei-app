import type { StudyStats } from "@/lib/types";

export function cardsRemainingToday(stats: StudyStats): number {
  // Kanji/vocab remaining-today only means anything on the standard track -- on kana,
  // new_kanji_today never advances (introduce_kanji is never called there), so its
  // "remaining" would otherwise read as a permanently-stuck kanji count. Same reasoning
  // in reverse for hiragana/katakana on the standard track.
  if (stats.study_track === "kana") {
    const remainingHiragana = Math.max(stats.new_hiragana_limit - stats.new_hiragana_today, 0);
    const remainingKatakana = Math.max(stats.new_katakana_limit - stats.new_katakana_today, 0);
    return stats.due_today + remainingHiragana + remainingKatakana;
  }
  const remainingKanji = Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0);
  const remainingVocab = Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0);
  return stats.due_today + remainingKanji + remainingVocab;
}
