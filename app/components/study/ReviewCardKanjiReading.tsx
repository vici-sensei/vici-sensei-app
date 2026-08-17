"use client";

import type { DueCard, Rating } from "@/lib/types";
import { FaCheck } from "react-icons/fa6";
import { checkKanjiReadingAnswer } from "@/lib/study/kanjiReadingMatch";
import { renderTargetWord } from "@/lib/study/furigana";
import { useTypedReviewCard } from "./useTypedReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";
import { Accent } from "./Accent";
import { AnswerForm } from "./AnswerForm";
import { TokenDiffList } from "./TokenDiffList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
  onCancelableChange?: (cancel: (() => void) | null) => void;
}

export function ReviewCardKanjiReading({ card, disabled, onRate, onCancelableChange }: Props) {
  const { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) =>
      checkKanjiReadingAnswer(
        input,
        card.kana_reading,
        card.romaji_reading,
        [...(card.other_readings ?? []), ...(card.all_word_readings ?? [])]
      ),
    onCancelableChange
  );

  return (
    <ReviewCardShell
      label="Word reading"
      accent="blue"
      prompt={
        <CardHeading furigana masked={!revealed}>
          {card.word
            ? renderTargetWord(card.word, card.kanji_char ?? "", card.furiganas, card.known_kanji_chars)
            : card.kanji_char}
        </CardHeading>
      }
      subtitle={
        <>
          How is this <Accent accent="blue">word read</Accent>?
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
          placeholder="Type the reading…"
          disabled={disabled}
          accent="blue"
        />
      }
      revealContent={
        result && (
          <>
            {!(!result.correct && result.targetDiff.map((c) => c.char).join("") === card.kana_reading) && (
              <div className="flex items-center justify-center gap-2 text-[1.3rem] font-bold text-white">
                {result.correct && <FaCheck className="text-accent-green" />}
                <span>{card.kana_reading}</span>
              </div>
            )}
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
