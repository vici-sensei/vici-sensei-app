"use client";

import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiMeaningAnswer } from "@/lib/study/kanjiMeaningMatch";
import { renderWordWithFurigana } from "@/lib/study/furigana";
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

export function ReviewCardVocabMeaning({ card, disabled, onRate }: Props) {
  const { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanjiMeaningAnswer(input, card.word_meanings ?? [])
  );

  return (
    <ReviewCardShell
      label="Vocabulary"
      accent="orange"
      prompt={
        <div
          className={`mb-2 pt-[0.6em] text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none ${revealed ? "" : "select-none"}`}
        >
          {card.word ? renderWordWithFurigana(card.word, card.furiganas) : card.word}
        </div>
      }
      subtitle={
        <>
          What does this <span className="font-extrabold text-accent-orange">word mean</span>?
        </>
      }
      revealed={revealed}
      correct={result?.correct ?? false}
      disabled={disabled}
      onRate={handleRate}
      onContinue={handleContinue}
      answerForm={
        <AnswerForm
          answer={answer}
          onAnswerChange={setAnswer}
          onSubmit={handleCheck}
          placeholder="Type a meaning…"
          disabled={disabled}
          accent="orange"
        />
      }
      revealContent={
        result && (
          <>
            <MeaningList meanings={card.word_meanings ?? []} matchedMeanings={result.matchedMeanings} correct={result.correct} />
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </>
        )
      }
    />
  );
}
