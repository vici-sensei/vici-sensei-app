import { useEffect, useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";
import type { AlternateOutcome, ConfirmedAlternate } from "@/lib/study/alternateAnswers";

export type { AlternateOutcome as AlternateCheckOutcome } from "@/lib/study/alternateAnswers";

// Same pause useTypedReviewCard gives a drill-mode card before handing it on -- drill-mode rates
// (the post-introduction kana drill, and every /study/practice card) never go through
// useStudyQueue's own pacing, so without it a correct answer would vanish the instant it's rated.
const FLASH_DELAY_MS = 350;

/**
 * Shared base for review cards where an answer can be an "alternate" (see
 * lib/study/alternateAnswers.ts: a homograph's sibling meaning/reading, a reading typed on a
 * meaning card, a meaning typed on a reading card, ...) without ending the review -- it gets a
 * checkmark, and the student is then prompted again instead of moving on. Mirrors
 * useTypedReviewCard's single check-then-reveal shape, plus the confirmedAlternates bookkeeping.
 * Used by ReviewCardKanjiMeaning, ReviewCardKanjiReading and ReviewCardVocabMeaning.
 */
export function useAlternateReviewCard<TResult>(
  card: DueCard,
  disabled: boolean,
  // userAnswer: the trimmed text of the answer that ended the review -- /study/practice shows it
  // next to the correct answer in its "done" summary; /study's rate() ignores it.
  onRate: (card: DueCard, rating: Rating, userAnswer?: string) => void,
  checkAnswer: (answer: string) => AlternateOutcome<TResult>,
  onCancelableChange?: (cancel: (() => void) | null) => void,
  // Set by /study/practice's free-practice mode (mirroring useTypedReviewCard's own drillMode): a
  // correct check skips the Hard/Good/Easy picker entirely and, once the user presses Continue,
  // rates 2 (the "correct" threshold rate() already uses to decide pass/fail for these cards)
  // instead of the 0 a wrong answer's Continue uses.
  drillMode?: boolean
) {
  const [answer, setAnswer] = useState("");
  const [confirmedAlternates, setConfirmedAlternates] = useState<ConfirmedAlternate[]>([]);
  const [result, setResult] = useState<TResult | null>(null);
  const [resultCorrect, setResultCorrect] = useState(false);
  const [committed, setCommitted] = useState(false);

  const revealed = result !== null;
  const inProgress = revealed || confirmedAlternates.length > 0;

  // One checkmark per alternate, even when several are confirmed at once -- only ones not already
  // confirmed are added.
  function addConfirmedAlternates(alternates: ConfirmedAlternate[]) {
    setConfirmedAlternates((prev) => {
      const fresh = alternates.filter((a) => !prev.some((p) => p.kind === a.kind && p.text === a.text));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    const outcome = checkAnswer(answer);
    if (outcome.kind === "alternate") {
      addConfirmedAlternates(outcome.alternates);
      setAnswer("");
      return;
    }
    // "final" can still name an alternate alongside the target/wrong answer -- show it as
    // confirmed either way.
    if (outcome.alternates && outcome.alternates.length > 0) addConfirmedAlternates(outcome.alternates);
    setResult(outcome.result);
    setResultCorrect(outcome.correct);
  }

  function cancelCheck() {
    setResult(null);
    setConfirmedAlternates([]);
  }

  function deliver(rating: Rating) {
    setCommitted(true);
    const typed = answer.trim();
    if (drillMode) setTimeout(() => onRate(card, rating, typed), FLASH_DELAY_MS);
    else onRate(card, rating, typed);
  }

  // Outside drill mode onRate is called right away -- useStudyQueue's rate() owns the pacing pause
  // itself (RATING_PACING_MS), timed to start after the server submit rather than before it, so an
  // achievement unlock has a chance to land before the queue actually swaps.
  function handleRate(rating: Rating) {
    deliver(rating);
  }

  function handleContinue() {
    deliver(drillMode && resultCorrect ? 2 : 0);
  }

  useEffect(() => {
    if (!onCancelableChange) return;
    onCancelableChange(inProgress && !committed ? cancelCheck : null);
    return () => onCancelableChange(null);
  }, [inProgress, committed, onCancelableChange]);

  const lastAlternate = confirmedAlternates.length > 0 ? confirmedAlternates[confirmedAlternates.length - 1] : null;

  return { answer, setAnswer, result, revealed, confirmedAlternates, lastAlternate, handleCheck, handleRate, handleContinue };
}
