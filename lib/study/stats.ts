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
  //
  // Uses new_X_available (Math.min(quota remaining, real un-introduced rows left) --
  // see fetchStudyStats) rather than new_X_limit - new_X_today directly: new_X_per_day has no
  // upper bound tied to how much content actually exists, so a quota set above the real content
  // pool would otherwise inflate this arbitrarily far past what /study could ever actually serve.
  if (stats.study_track === "kana") {
    const remainingHiragana = stats.study_hiragana ? stats.new_hiragana_available : 0;
    const remainingKatakana = stats.study_katakana ? stats.new_katakana_available : 0;
    return stats.due_today + remainingHiragana * 2 + remainingKatakana * 2;
  }
  const remainingKanji = stats.study_kanji ? stats.new_kanji_available : 0;
  const remainingVocab = stats.study_vocabulary ? stats.new_vocab_available : 0;
  return stats.due_today + remainingKanji * 2 + stats.new_kanji_pending_review_cards + remainingVocab * 2;
}
