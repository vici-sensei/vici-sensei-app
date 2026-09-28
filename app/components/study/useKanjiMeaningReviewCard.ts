import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiMeaningCard } from "@/lib/study/alternateAnswers";
import { useExtendedRomajiUnits } from "@/lib/study/useExtendedRomajiUnits";
import { useAlternateReviewCard } from "@/app/components/study/useAlternateReviewCard";

/**
 * A kanji meaning card accepts one of the kanji's kun/on readings (kana, Hepburn romaji, or an
 * "Extended romaji" spelling) without ending the review: it gets a checkmark, shown in the kana the
 * kanji data stores it in, and the student is asked for the meaning. See checkKanjiMeaningCard.
 */
export function useKanjiMeaningReviewCard(
  card: DueCard,
  disabled: boolean,
  onRate: (card: DueCard, rating: Rating) => void,
  onCancelableChange?: (cancel: (() => void) | null) => void,
  drillMode?: boolean
) {
  const units = useExtendedRomajiUnits();
  return useAlternateReviewCard(
    card,
    disabled,
    onRate,
    (answer) => checkKanjiMeaningCard(answer, card.kanji_meanings ?? [], card.kanji_readings, units),
    onCancelableChange,
    drillMode
  );
}
