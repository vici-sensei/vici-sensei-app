"use client";

import type { DueCard, Rating } from "@/lib/types";
import { FaCheck } from "react-icons/fa6";
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
  const { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanjiReadingAnswer(input, card.kana_reading, card.romaji_reading, card.other_readings)
  );

  return (
    <ReviewCardShell
      label="Word reading"
      accent="blue"
      prompt={
        <div
          className={`mb-2 pt-[0.6em] text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none ${revealed ? "" : "select-none"}`}
        >
          {card.word ? renderTargetWord(card.word, card.kanji_char ?? "", card.furiganas) : card.kanji_char}
        </div>
      }
      subtitle={
        <>
          How is this <span className="font-extrabold text-accent-blue">word read</span>?
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
          placeholder="Type the reading…"
          disabled={disabled}
          accent="blue"
        />
      }
      revealContent={
        result && (
          <>
            <div className="flex items-center justify-center gap-2 text-[1.3rem] font-bold text-white">
              {result.correct && <FaCheck className="text-accent-green" />}
              <span>{card.kana_reading}</span>
            </div>
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
