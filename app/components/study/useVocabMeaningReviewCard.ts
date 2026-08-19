import type { DueCard, Rating } from "@/lib/types";
import { checkVocabMeaningAnswer } from "@/lib/study/kanjiMeaningMatch";
import { useAlternateReviewCard } from "@/app/components/study/useAlternateReviewCard";

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
  return useAlternateReviewCard(
    card,
    disabled,
    onRate,
    (answer) => {
      const outcome = checkVocabMeaningAnswer(answer, card.word_meanings ?? [], card.all_word_meanings ?? card.word_meanings ?? []);
      if (outcome.kind === "alternate") {
        return { kind: "alternate", alternates: outcome.meanings };
      }
      return {
        kind: "final",
        result: outcome.result,
        alternates: outcome.siblingMeanings.length > 0 ? outcome.siblingMeanings : undefined,
      };
    },
    onCancelableChange
  );
}
