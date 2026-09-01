import type { StudyStats } from "@/lib/types";
import { computeTotalCardsToday } from "./totalCardsToday";

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
  // Uses new_X_available (Math.min(quota remaining, real un-introduced rows left) --
  // see fetchStudyStats) rather than new_X_limit - new_X_today directly: new_X_per_day has no
  // upper bound tied to how much content actually exists, so a quota set above the real content
  // pool would otherwise inflate this arbitrarily far past what /study could ever actually serve.
  //
  // Delegates the actual arithmetic to computeTotalCardsToday, shared with computePredictedTotal
  // in lib/data/studyQueue.ts -- the dashboard's stat here has no hiragana/katakana *rule*
  // candidate counts available (fetchStudyStats doesn't fetch those, unlike a live /study queue
  // fetch), so those two inputs are always 0: a rare open rule card just won't be counted here
  // until it's actually fetched by /study, same as before this was consolidated.
  if (stats.study_track === "kana") {
    return computeTotalCardsToday({
      dueCount: stats.due_today,
      kanjiCandidateCount: 0,
      kanjiWordReadingCardsTotal: 0,
      vocabCandidateCount: 0,
      hiraganaCandidateCount: stats.study_hiragana ? stats.new_hiragana_available : 0,
      katakanaCandidateCount: stats.study_katakana ? stats.new_katakana_available : 0,
      hiraganaRuleCandidateCount: 0,
      katakanaRuleCandidateCount: 0,
    });
  }
  return computeTotalCardsToday({
    dueCount: stats.due_today,
    kanjiCandidateCount: stats.study_kanji ? stats.new_kanji_available : 0,
    kanjiWordReadingCardsTotal: stats.new_kanji_pending_review_cards,
    vocabCandidateCount: stats.study_vocabulary ? stats.new_vocab_available : 0,
    hiraganaCandidateCount: 0,
    katakanaCandidateCount: 0,
    hiraganaRuleCandidateCount: 0,
    katakanaRuleCandidateCount: 0,
  });
}
