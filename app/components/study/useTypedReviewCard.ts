import { useEffect, useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";

const FLASH_DELAY_MS = 350;

export function useTypedReviewCard<TResult extends { correct: boolean }>(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating) => void,
  checkAnswer: (answer: string) => TResult,
  // Reports a function that cancels the current Check while it's still un-rated (so the
  // page-level Undo pill can offer "undo my Check" instead of "undo my last submitted
  // review"), and reports null once there's nothing left to cancel.
  onCancelableChange?: (cancel: (() => void) | null) => void,
  // Set by the post-introduction kana drill (ReviewCardKanaReading's drillMode): a correct
  // check skips the Hard/Good/Easy picker entirely and auto-advances, same as a wrong answer's
  // Continue button already does, rated 2 (matches the "correct" threshold rate() already uses
  // to decide pass/fail for these cards -- see useStudyQueue.ts).
  autoAdvanceOnCorrect?: boolean
) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TResult | null>(null);
  const [committed, setCommitted] = useState(false);

  const revealed = result !== null;

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    const outcome = checkAnswer(answer);
    setResult(outcome);
    if (autoAdvanceOnCorrect && outcome.correct) {
      setCommitted(true);
      setTimeout(() => onRate(card, 2), FLASH_DELAY_MS);
    }
  }

  function cancelCheck() {
    setResult(null);
  }

  function handleRate(rating: Rating) {
    setCommitted(true);
    setTimeout(() => onRate(card, rating), FLASH_DELAY_MS);
  }

  function handleContinue() {
    setCommitted(true);
    setTimeout(() => onRate(card, 0), FLASH_DELAY_MS);
  }

  useEffect(() => {
    if (!onCancelableChange) return;
    onCancelableChange(revealed && !committed ? cancelCheck : null);
    return () => onCancelableChange(null);
  }, [revealed, committed, onCancelableChange]);

  return { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue };
}
