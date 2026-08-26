import type { StudyStats } from "@/lib/types";

export function cardsRemainingToday(stats: StudyStats): number {
  // Kanji/vocab remaining-today only means anything on the standard track -- on kana,
  // new_kanji_today never advances (introduce_kanji is never called there), so its
  // "remaining" would otherwise read as a permanently-stuck kanji count. Same reasoning
  // in reverse for hiragana/katakana on the standard track.
  //
  // Each category is also gated on its own study_* flag: e.g. study_katakana stays false
  // until every hiragana has graduated to review, so a brand-new kana learner would
  // otherwise get new_katakana_limit (15) phantom cards added on top of their real
  // hiragana count, since new_katakana_today is 0 for a category they can't touch yet.
  //
  // Each pending candidate isn't 1 card -- it's the "New X" card itself PLUS whatever
  // review card(s) introducing it is guaranteed to produce today (see computePredictedTotal
  // in lib/data/studyQueue.ts, which this mirrors so /dashboard and /study never disagree):
  // a flat 2 for vocab/hiragana/katakana (the New card + its one future review card), or
  // 2 + word_count for kanji, since a kanji's Word reading cards vary with its example-word
  // count -- that per-candidate sum arrives pre-computed as new_kanji_pending_review_cards.
  if (stats.study_track === "kana") {
    const remainingHiragana = stats.study_hiragana
      ? Math.max(stats.new_hiragana_limit - stats.new_hiragana_today, 0)
      : 0;
    const remainingKatakana = stats.study_katakana
      ? Math.max(stats.new_katakana_limit - stats.new_katakana_today, 0)
      : 0;
    return stats.due_today + remainingHiragana * 2 + remainingKatakana * 2;
  }
  const remainingKanji = stats.study_kanji ? Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0) : 0;
  const remainingVocab = stats.study_vocabulary
    ? Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0)
    : 0;
  return stats.due_today + remainingKanji * 2 + stats.new_kanji_pending_review_cards + remainingVocab * 2;
}
