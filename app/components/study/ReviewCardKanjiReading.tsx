"use client";

import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiReadingAnswer } from "@/lib/study/kanjiReadingMatch";
import { renderTargetWord } from "@/lib/study/furigana";
import { useTypedReviewCard } from "./useTypedReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { AnswerForm } from "./AnswerForm";
import { TokenDiffList } from "./TokenDiffList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardKanjiReading({ card, disabled, onRate }: Props) {
  const { answer, setAnswer, result, revealed, flash, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanjiReadingAnswer(input, card.kana_reading, card.romaji_reading, card.other_readings)
  );

  return (
    <ReviewCardShell
      label="Word reading"
      flash={flash}
      prompt={
        <div className="mb-2 pt-[0.6em] text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none">
          {card.word ? renderTargetWord(card.word, card.kanji_char ?? "", card.furiganas) : card.kanji_char}
        </div>
      }
      subtitle="How is this word read?"
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
          placeholder="Type the reading…"
          disabled={disabled}
        />
      }
      revealContent={
        result && (
          <>
            <div className="text-[1.3rem] font-bold text-white">{card.kana_reading}</div>
            {!result.correct && (
              <TokenDiffList
                tokens={[{ raw: "", correct: false, userDiff: result.userDiff, targetDiff: result.targetDiff }]}
              />
            )}
          </>
        )
      }
    />
  );
}
