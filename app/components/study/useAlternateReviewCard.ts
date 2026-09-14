import { useEffect, useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";

export type AlternateCheckOutcome<TResult> =
  | { kind: "alternate"; alternates: string[] }
  // `correct` is duplicated out of `result` (rather than read off it directly) so drillMode's
  // Continue-vs-grid decision below doesn't need a `{ correct: boolean }` constraint on TResult
  // -- adding one previously made TS give up inferring the real TResult from this nested-in-a-
  // union return position and silently fall back to the constraint itself.
  | { kind: "final"; result: TResult; correct: boolean; alternates?: string[] };

/**
 * Shared base for review cards where an answer can name a "sibling" alternate
 * (a homograph word's other reading/meaning) without ending the review -- the
 * student gets credit for it, but is then prompted for another answer instead
 * of moving on. Mirrors useTypedReviewCard's single check-then-reveal shape,
 * plus the confirmedAlternates bookkeeping both useKanjiReadingReviewCard and
 * useVocabMeaningReviewCard need.
 */
export function useAlternateReviewCard<TResult>(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating, confirmedAlternates?: string[]) => void,
  checkAnswer: (answer: string) => AlternateCheckOutcome<TResult>,
  onCancelableChange?: (cancel: (() => void) | null) => void,
  // Set by /study/practice's free-practice mode (ReviewCardKanjiReading/ReviewCardVocabMeaning's
  // drillMode, mirroring useTypedReviewCard's own drillMode): a correct check skips the
  // Hard/Good/Easy picker entirely and, once the user presses Continue, rates 2 (the "correct"
  // threshold rate() already uses to decide pass/fail for these cards) instead of the 0 a wrong
  // answer's Continue uses.
  drillMode?: boolean
) {
  const [answer, setAnswer] = useState("");
  const [confirmedAlternates, setConfirmedAlternates] = useState<string[]>([]);
  const [result, setResult] = useState<TResult | null>(null);
  const [resultCorrect, setResultCorrect] = useState(false);
  const [committed, setCommitted] = useState(false);

  const revealed = result !== null;
  const inProgress = revealed || confirmedAlternates.length > 0;

  // One checkmark per alternate, even when several are confirmed at once --
  // only ones not already confirmed are added.
  function addConfirmedAlternates(alternates: string[]) {
    setConfirmedAlternates((prev) => {
      const fresh = alternates.filter((a) => !prev.includes(a));
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
    // "final" can still name a sibling alongside the target/wrong answer -- show it as
    // confirmed either way.
    if (outcome.alternates && outcome.alternates.length > 0) addConfirmedAlternates(outcome.alternates);
    setResult(outcome.result);
    setResultCorrect(outcome.correct);
  }

  function cancelCheck() {
    setResult(null);
    setConfirmedAlternates([]);
  }

  // Calls onRate right away instead of delaying it here -- useStudyQueue's rate() now owns the
  // pacing pause itself (RATING_PACING_MS), timed to start after the server submit rather than
  // before it, so an achievement unlock has a chance to land before the queue actually swaps.
  function handleRate(rating: Rating) {
    setCommitted(true);
    onRate(card, rating, confirmedAlternates);
  }

  function handleContinue() {
    setCommitted(true);
    const rating = drillMode && resultCorrect ? 2 : 0;
    onRate(card, rating, confirmedAlternates);
  }

  useEffect(() => {
    if (!onCancelableChange) return;
    onCancelableChange(inProgress && !committed ? cancelCheck : null);
    return () => onCancelableChange(null);
  }, [inProgress, committed, onCancelableChange]);

  return { answer, setAnswer, result, revealed, confirmedAlternates, handleCheck, handleRate, handleContinue };
}
