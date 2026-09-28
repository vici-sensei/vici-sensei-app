"use client";

import type { DueCard, Rating } from "@/lib/types";
import { useKanjiMeaningReviewCard } from "./useKanjiMeaningReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";
import { Accent } from "./Accent";
import { AnswerForm } from "./AnswerForm";
import { MeaningList } from "./MeaningList";
import { TokenDiffList } from "./TokenDiffList";
import { ConfirmedAnswersList } from "./ConfirmedAnswersList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
  onCancelableChange?: (cancel: (() => void) | null) => void;
}

export function ReviewCardKanjiMeaning({ card, disabled, onRate, onCancelableChange }: Props) {
  const { answer, setAnswer, result, revealed, confirmedAlternates, handleCheck, handleRate, handleContinue } =
    useKanjiMeaningReviewCard(card, disabled, onRate, onCancelableChange, card.drill_mode);

  // The only alternate this card has is one of the kanji's readings.
  const askingAfterReading = confirmedAlternates.length > 0 && !revealed;

  return (
    <ReviewCardShell
      label="Kanji meaning"
      accent="violet"
      prompt={
        <CardHeading masked={!revealed}>
          {card.kanji_char}
        </CardHeading>
      }
      subtitle={
        askingAfterReading ? (
          <>
            That&apos;s a reading. What does it <Accent accent="violet">mean</Accent>?
          </>
        ) : (
          <>
            What does this <Accent accent="violet">kanji mean</Accent>?
          </>
        )
      }
      revealed={revealed}
      checkDisabled={disabled || !answer.trim()}
      correct={result?.correct ?? false}
      disabled={disabled}
      ratingPreviews={card.rating_previews}
      onRate={handleRate}
      onContinue={handleContinue}
      hideRatingOnCorrect={card.drill_mode}
      answerForm={
        <div className="flex flex-col gap-5">
          <ConfirmedAnswersList answers={confirmedAlternates} />
          <AnswerForm
            answer={answer}
            onAnswerChange={setAnswer}
            onSubmit={handleCheck}
            placeholder="Type a meaning…"
            disabled={disabled}
            accent="violet"
          />
        </div>
      }
      revealContent={
        result && (
          <div className="flex flex-col gap-3">
            <ConfirmedAnswersList answers={confirmedAlternates} subdued />
            <MeaningList meanings={card.kanji_meanings ?? []} matchedMeanings={result.matchedMeanings} correct={result.correct} />
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </div>
        )
      }
    />
  );
}
