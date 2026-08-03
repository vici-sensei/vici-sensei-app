"use client";

import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiMeaningAnswer } from "@/lib/study/kanjiMeaningMatch";
import { useTypedReviewCard } from "./useTypedReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
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
        <div
          className={`mb-2 text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none ${revealed ? "" : "select-none"}`}
        >
          {card.kanji_char}
        </div>
      }
      subtitle={
        <>
          What does this <span className="font-extrabold text-accent-violet">kanji mean</span>?
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
