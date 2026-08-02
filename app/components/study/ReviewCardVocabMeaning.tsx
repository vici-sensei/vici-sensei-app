"use client";

import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiMeaningAnswer } from "@/lib/study/kanjiMeaningMatch";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { useTypedReviewCard } from "./useTypedReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { AnswerForm } from "./AnswerForm";
import { TokenDiffList } from "./TokenDiffList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardVocabMeaning({ card, disabled, onRate }: Props) {
  const { answer, setAnswer, result, revealed, flash, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanjiMeaningAnswer(input, card.word_meanings ?? [])
  );

  return (
    <ReviewCardShell
      label="Vocabulary"
      flash={flash}
      prompt={
        <div
          className={`mb-2 pt-[0.6em] text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none ${revealed ? "" : "select-none"}`}
        >
          {card.word ? renderWordWithFurigana(card.word, card.furiganas) : card.word}
        </div>
      }
      subtitle="What does this word mean?"
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
        />
      }
      revealContent={
        result && (
          <>
            <div className="text-[1.3rem] font-bold text-white">{card.word_meanings?.join(", ")}</div>
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </>
        )
      }
    />
  );
}
