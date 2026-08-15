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
  onCancelableChange?: (cancel: (() => void) | null) => void
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
