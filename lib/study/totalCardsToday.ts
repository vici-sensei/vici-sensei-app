/** Shared core of "how many cards are there to get through today, counting not-yet-created
 * future cards as already certain" -- used by both lib/data/studyQueue.ts's computePredictedTotal
 * (drives the /study progress bar, fed by a live queue fetch's own candidate arrays) and
 * lib/study/stats.ts's cardsRemainingToday (drives the dashboard, fed by StudyStats' aggregate
 * counts). Those two used to each carry their own copy of this arithmetic, kept in sync only by a
 * comment asking whoever changed one to remember the other -- a formula change landing in just one
 * of them would silently make /dashboard and /study disagree, the same "same rule, two independent
 * copies" shape as the drill_mode bug 20260911_drill_mode_and_atomic_undo.sql closed. Now there's
 * exactly one place the arithmetic itself can be wrong.
 *
 * Every "New X" candidate counts as itself PLUS the review card(s) introducing it is guaranteed
 * to produce: 1 (New kanji) + 1 (Kanji meaning) + word_count (Word reading) per kanji candidate,
 * or a flat 2 (the New card itself + its one future review card) for vocab/hiragana/katakana, each
 * of which has exactly one future review card per candidate (get_kanji_intro_cards,
 * complete_vocab_batch, get_hiragana/katakana_reading_cards all confirm this 1:1 relationship) --
 * see 20260831_predicted_daily_total.sql for why this is knowable before any of it exists.
 *
 * hiragana/katakana rule cards work differently: each is a flat 1 (read-only, no review card of
 * its own), but as of 20261024_atomic_rule_example_handoff.sql, a rule for a kana_type with an
 * example pack (sokuon/yoon/n_gemination/choonpu/extended) atomically produces that whole pack's
 * worth of hiragana_reading/katakana_reading cards too -- each of THOSE is also a flat 1 (unlike a
 * character candidate's flat 2, an example row never gets its own separate intro tap). So
 * hiraganaRuleForecastCount/katakanaRuleForecastCount aren't "how many rule candidates are
 * eligible to show right now" (get_new_hiragana_rule_candidates is deliberately strict about
 * that, showing only the next kana_type in line) -- they're a forecast from
 * get_hiragana_rule_forecast/get_katakana_rule_forecast: the total rule-card + example-card count
 * across every not-yet-introduced kana_type that will fit in today's remaining budget, including
 * ones not eligible to show yet because an earlier kana_type's pack hasn't landed. */
export interface TotalCardsTodayInput {
  dueCount: number;
  kanjiCandidateCount: number;
  /** Sum of word_count across every pending kanji candidate -- the variable "Word reading" part
   * that keeps a kanji candidate from being a flat 2 like every other category. */
  kanjiWordReadingCardsTotal: number;
  vocabCandidateCount: number;
  hiraganaCandidateCount: number;
  katakanaCandidateCount: number;
  hiraganaRuleForecastCount: number;
  katakanaRuleForecastCount: number;
}

export function computeTotalCardsToday(input: TotalCardsTodayInput): number {
  return (
    input.dueCount +
    input.kanjiCandidateCount * 2 +
    input.kanjiWordReadingCardsTotal +
    input.vocabCandidateCount * 2 +
    input.hiraganaCandidateCount * 2 +
    input.katakanaCandidateCount * 2 +
    input.hiraganaRuleForecastCount +
    input.katakanaRuleForecastCount
  );
}
