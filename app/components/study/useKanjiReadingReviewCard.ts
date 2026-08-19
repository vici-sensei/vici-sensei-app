import { useEffect, useState } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiReadingAnswer } from "@/lib/study/kanjiReadingMatch";
import { fetchSiblingReadingPairs } from "@/lib/data/vocabulary";
import { useAlternateReviewCard } from "@/app/components/study/useAlternateReviewCard";

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
 * That multi-step exchange is handled by the shared useAlternateReviewCard,
 * this hook just supplies the reading-specific checkAnswer and the romaji
 * sibling lookup.
 */
export function useKanjiReadingReviewCard(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating) => void,
  onCancelableChange?: (cancel: (() => void) | null) => void
) {
  // get_due_cards.all_word_readings flattens every sibling row's kana_reading and
  // romaji_reading together, so it can't say which romaji belongs to which kana.
  // Fetched separately (see fetchSiblingReadingPairs) so a sibling reading typed
  // in romaji can still be shown in its real kana form -- kana is always preferred
  // for display, matching how the target reading itself is always shown in kana
  // regardless of how the student typed it.
  const [romajiToKana, setRomajiToKana] = useState<Map<string, string>>(new Map());

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

  return useAlternateReviewCard(
    card,
    disabled,
    onRate,
    (answer) => {
      const outcome = checkKanjiReadingAnswer(
        answer,
        card.kana_reading,
        card.romaji_reading,
        card.other_readings,
        card.all_word_readings
      );
      if (outcome.kind === "alternate") {
        const display = romajiToKana.get(normalizeReading(outcome.display)) ?? outcome.display;
        return { kind: "alternate", alternates: [display] };
      }
      return { kind: "final", result: outcome.result };
    },
    onCancelableChange
  );
}
