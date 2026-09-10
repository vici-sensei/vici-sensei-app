import { useEffect, useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";

const FLASH_DELAY_MS = 350;

export function useTypedReviewCard<TResult extends { correct: boolean }>(
  card: DueCard,
  disabled: boolean,
  // userAnswer is the trimmed text the user actually typed, passed through on every rate --
  // ReviewCardKanaReading's caller (app/(study)/study/practice) reads it off a wrong rating to
  // show what the user wrote next to the correct answer in its "done" summary. Optional because
  // every other caller's onRate type only declares (card, rating) and simply ignores the extra
  // argument.
  onRate: (card: DueCard, rating: Rating, userAnswer?: string) => void,
  checkAnswer: (answer: string) => TResult,
  // Reports a function that cancels the current Check while it's still un-rated (so the
  // page-level Undo pill can offer "undo my Check" instead of "undo my last submitted
  // review"), and reports null once there's nothing left to cancel.
  onCancelableChange?: (cancel: (() => void) | null) => void,
  // Set by the post-introduction kana drill (ReviewCardKanaReading's drillMode): a correct
  // check skips the Hard/Good/Easy picker entirely and, once the user presses Continue, rates
  // 2 (matches the "correct" threshold rate() already uses to decide pass/fail for these cards
  // -- see useStudyQueue.ts) instead of the 0 a wrong answer's Continue uses.
  drillMode?: boolean
) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TResult | null>(null);
  const [committed, setCommitted] = useState(false);

  const revealed = result !== null;

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    setResult(checkAnswer(answer));
  }

  function cancelCheck() {
    setResult(null);
  }

  // Drill-mode cards (submitDrillAnswer) keep the delay here, same as always -- they never go
  // through rate()'s own pacing (RATING_PACING_MS in useStudyQueue.ts), so there'd be no pause
  // at all without it. Every other card calls onRate right away instead: useStudyQueue's rate()
  // now owns that pause itself, timed to start after the server submit rather than before it, so
  // an achievement unlock has a chance to land before the queue actually swaps.
  function handleRate(rating: Rating) {
    setCommitted(true);
    if (drillMode) setTimeout(() => onRate(card, rating, answer.trim()), FLASH_DELAY_MS);
    else onRate(card, rating, answer.trim());
  }

  function handleContinue() {
    setCommitted(true);
    const rating = drillMode && result?.correct ? 2 : 0;
    if (drillMode) setTimeout(() => onRate(card, rating, answer.trim()), FLASH_DELAY_MS);
    else onRate(card, rating, answer.trim());
  }

  useEffect(() => {
    if (!onCancelableChange) return;
    onCancelableChange(revealed && !committed ? cancelCheck : null);
    return () => onCancelableChange(null);
  }, [revealed, committed, onCancelableChange]);

  return { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue };
}
