import { useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";

const FLASH_DELAY_MS = 350;

export type CardFlash = "correct" | "wrong" | null;

export function useTypedReviewCard<TResult extends { correct: boolean }>(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating) => void,
  checkAnswer: (answer: string) => TResult
) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<TResult | null>(null);

  const revealed = result !== null;
  const flash: CardFlash = result === null ? null : result.correct ? "correct" : "wrong";

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    setResult(checkAnswer(answer));
  }

  function handleRate(rating: Rating) {
    setTimeout(() => onRate(card, rating), FLASH_DELAY_MS);
  }

  function handleContinue() {
    setTimeout(() => onRate(card, 0), FLASH_DELAY_MS);
  }

  return { answer, setAnswer, result, revealed, flash, handleCheck, handleRate, handleContinue };
}
