import { useEffect, useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiReadingAnswer, type ReadingCheckResult } from "@/lib/study/kanjiReadingMatch";
import { fetchSiblingReadingPairs } from "@/lib/data/vocabulary";

const FLASH_DELAY_MS = 350;

function normalizeReading(value: string): string {
  return value.trim().toLowerCase();
}

function hasSiblingReadings(card: DueCard): boolean {
  const ownVariants = new Set(
    [card.kana_reading, card.romaji_reading, ...(card.other_readings ?? [])].filter((v): v is string => !!v).map(normalizeReading)
  );
  return (card.all_word_readings ?? []).some((r) => !ownVariants.has(normalizeReading(r)));
}

/**
 * Kanji reading cards can accept a "sibling" reading of a homograph word
 * without ending the review (see checkKanjiReadingAnswer) -- the student gets
 * credit for it, but is then asked for another reading instead of moving on.
 * That multi-step exchange doesn't fit useTypedReviewCard's single
 * check-then-reveal shape, hence this dedicated hook.
 */
export function useKanjiReadingReviewCard(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating) => void,
  onCancelableChange?: (cancel: (() => void) | null) => void
) {
  const [answer, setAnswer] = useState("");
  const [confirmedAlternates, setConfirmedAlternates] = useState<string[]>([]);
  const [result, setResult] = useState<ReadingCheckResult | null>(null);
  const [committed, setCommitted] = useState(false);
  // get_due_cards.all_word_readings flattens every sibling row's kana_reading and
  // romaji_reading together, so it can't say which romaji belongs to which kana.
  // Fetched separately (see fetchSiblingReadingPairs) so a sibling reading typed
  // in romaji can still be shown in its real kana form -- kana is always preferred
  // for display, matching how the target reading itself is always shown in kana
  // regardless of how the student typed it.
  const [romajiToKana, setRomajiToKana] = useState<Map<string, string>>(new Map());

  const revealed = result !== null;
  const inProgress = revealed || confirmedAlternates.length > 0;

  useEffect(() => {
    if (!card.word || !hasSiblingReadings(card)) return;
    let cancelled = false;
    fetchSiblingReadingPairs(card.word)
      .then((pairs) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const pair of pairs) {
          if (pair.romajiReading && pair.kanaReading) {
            map.set(normalizeReading(pair.romajiReading), pair.kanaReading);
          }
        }
        setRomajiToKana(map);
      })
      .catch(() => {
        // Best-effort: a romaji sibling match just falls back to displaying the
        // romaji text as typed if this lookup didn't come back in time or failed.
      });
    return () => {
      cancelled = true;
    };
    // card.word is the only field this depends on; other DueCard fields (progress,
    // rating previews, ...) change between reviews of the *same* word without
    // needing a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.word]);

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    const outcome = checkKanjiReadingAnswer(
      answer,
      card.kana_reading,
      card.romaji_reading,
      card.other_readings,
      card.all_word_readings
    );
    if (outcome.kind === "alternate") {
      const display = romajiToKana.get(normalizeReading(outcome.display)) ?? outcome.display;
      setConfirmedAlternates((prev) => (prev.includes(display) ? prev : [...prev, display]));
      setAnswer("");
      return;
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
