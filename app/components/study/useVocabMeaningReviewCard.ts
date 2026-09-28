import type { DueCard, Rating } from "@/lib/types";
import { checkVocabMeaningCard } from "@/lib/study/alternateAnswers";
import { useExtendedRomajiUnits } from "@/lib/study/useExtendedRomajiUnits";
import { useAlternateReviewCard } from "@/app/components/study/useAlternateReviewCard";

/**
 * A vocabulary card accepts, without ending the review, a sibling sense of the word (same word and
 * reading, another sense -- see checkVocabMeaningAnswer), the word's own reading, or the meaning of
 * one of its kanji: each gets a checkmark and the student is asked again. See checkVocabMeaningCard.
 */
export function useVocabMeaningReviewCard(
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
    (answer) =>
      checkVocabMeaningCard(
        answer,
        {
          primaryMeanings: card.primary_word_meanings ?? [],
          allMeanings: card.all_primary_word_meanings ?? card.primary_word_meanings ?? [],
          kanaReading: card.kana_reading,
          romajiReading: card.romaji_reading,
          otherReadings: card.other_readings,
          wordKanji: card.word_kanji,
        },
        units
      ),
    onCancelableChange,
    drillMode
  );
}
