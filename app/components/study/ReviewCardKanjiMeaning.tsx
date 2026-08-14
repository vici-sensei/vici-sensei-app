"use client";

import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiMeaningAnswer } from "@/lib/study/kanjiMeaningMatch";
import { useTypedReviewCard } from "./useTypedReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";
import { Accent } from "./Accent";
import { AnswerForm } from "./AnswerForm";
import { MeaningList } from "./MeaningList";
import { TokenDiffList } from "./TokenDiffList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardKanjiMeaning({ card, disabled, onRate }: Props) {
  const { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanjiMeaningAnswer(input, card.kanji_meanings ?? [])
  );

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
        <>
          What does this <Accent accent="violet">kanji mean</Accent>?
        </>
      }
      revealed={revealed}
      correct={result?.correct ?? false}
      disabled={disabled}
      ratingPreviews={card.rating_previews}
      onRate={handleRate}
      onContinue={handleContinue}
      answerForm={
        <AnswerForm
          answer={answer}
          onAnswerChange={setAnswer}
          onSubmit={handleCheck}
          placeholder="Type a meaning…"
          disabled={disabled}
          accent="violet"
        />
      }
      revealContent={
        result && (
          <>
            <MeaningList meanings={card.kanji_meanings ?? []} matchedMeanings={result.matchedMeanings} correct={result.correct} />
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </>
        )
      }
    />
  );
}
