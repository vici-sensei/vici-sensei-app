"use client";

import type { DueCard, Rating } from "@/lib/types";
import { FaCheck } from "react-icons/fa6";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (rating: Rating) => void;
}

/**
 * Shown right after a "Vocabulary"/"Word reading" review whose student also confirmed a sibling
 * homograph's meaning/reading along the way (see useAlternateReviewCard's confirmedAlternates,
 * resolved into a real DueCard by resolveConfirmedSiblings). The answer is already known correct
 * -- there's nothing left to type -- so this skips straight to the rating step on the same card
 * shell instead of asking the student to answer it again. useStudyQueue's rateSibling submits the
 * chosen rating as that sibling's own real review, linked back to the review that surfaced it.
 */
export function ReviewCardRateSibling({ card, disabled, onRate }: Props) {
  const isKanjiReading = card.exercise_type === "kanji_reading";

  return (
    <ReviewCardShell
      label={isKanjiReading ? "Word reading" : "Vocabulary"}
      accent={isKanjiReading ? "blue" : "orange"}
      prompt={
        <CardHeading furigana>{card.word ? renderWordWithFurigana(card.word, card.furiganas) : card.word}</CardHeading>
      }
      subtitle="You just showed you already know this one, too. How well did you know it?"
      revealed
      answerForm={null}
      checkDisabled
      revealContent={
        <div className="flex items-center justify-center gap-2 text-[1.3rem] font-bold text-white">
          <FaCheck className="text-accent-green" />
          <span>{isKanjiReading ? card.kana_reading : card.word_meanings?.join(", ")}</span>
        </div>
      }
      correct
      disabled={disabled}
      ratingPreviews={card.rating_previews}
      onRate={onRate}
      onContinue={() => onRate(0)}
    />
  );
}
