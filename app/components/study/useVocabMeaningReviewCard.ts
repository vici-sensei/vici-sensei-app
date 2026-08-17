import { useEffect, useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { checkVocabMeaningAnswer, type MeaningCheckResult } from "@/lib/study/kanjiMeaningMatch";

const FLASH_DELAY_MS = 350;

/**
 * Mirrors useKanjiReadingReviewCard: a vocabulary card can accept a "sibling"
 * meaning of a homograph word (same word + kana_reading, different row) without
 * ending the review -- the student gets credit for it, but is then asked for
 * another meaning instead of moving on. See checkVocabMeaningAnswer.
 */
export function useVocabMeaningReviewCard(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating) => void,
  onCancelableChange?: (cancel: (() => void) | null) => void
) {
  const [answer, setAnswer] = useState("");
  const [confirmedAlternates, setConfirmedAlternates] = useState<string[]>([]);
  const [result, setResult] = useState<MeaningCheckResult | null>(null);
  const [committed, setCommitted] = useState(false);

  const revealed = result !== null;
  const inProgress = revealed || confirmedAlternates.length > 0;

  // One checkmark per meaning, even when several are typed in the same answer
  // (e.g. "collar, calla lily") -- only meanings not already confirmed are added.
  function addConfirmedMeanings(meanings: string[]) {
    setConfirmedAlternates((prev) => {
      const fresh = meanings.filter((m) => !prev.includes(m));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    const outcome = checkVocabMeaningAnswer(answer, card.word_meanings ?? [], card.all_word_meanings ?? card.word_meanings ?? []);
    if (outcome.kind === "alternate") {
      addConfirmedMeanings(outcome.meanings);
      setAnswer("");
      return;
    }
    // "target" and "wrong" both end the review, but either can still name a sibling
    // meaning alongside the target/invalid part -- show it as confirmed either way.
    if (outcome.siblingMeanings.length > 0) {
      addConfirmedMeanings(outcome.siblingMeanings);
    }
    setResult(outcome.result);
  }

  function cancelCheck() {
    setResult(null);
    setConfirmedAlternates([]);
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
    onCancelableChange(inProgress && !committed ? cancelCheck : null);
    return () => onCancelableChange(null);
  }, [inProgress, committed, onCancelableChange]);

  return { answer, setAnswer, result, revealed, confirmedAlternates, handleCheck, handleRate, handleContinue };
}
