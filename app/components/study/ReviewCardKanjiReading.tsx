"use client";

import type { DueCard, Rating } from "@/lib/types";
import { FaCheck } from "react-icons/fa6";
import { renderTargetWord } from "@/lib/study/furigana";
import { useKanjiReadingReviewCard } from "./useKanjiReadingReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";
import { Accent } from "./Accent";
import { AnswerForm } from "./AnswerForm";
import { TokenDiffList } from "./TokenDiffList";
import { ConfirmedAnswersList } from "./ConfirmedAnswersList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
  onCancelableChange?: (cancel: (() => void) | null) => void;
}

export function ReviewCardKanjiReading({ card, disabled, onRate, onCancelableChange }: Props) {
  const { answer, setAnswer, result, revealed, confirmedAlternates, handleCheck, handleRate, handleContinue } =
    useKanjiReadingReviewCard(card, disabled, onRate, onCancelableChange);

  const askingForAnother = confirmedAlternates.length > 0 && !revealed;

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
        askingForAnother ? (
          <>
            What <Accent accent="blue">other reading</Accent> does this word have?
          </>
        ) : (
          <>
            How is this <Accent accent="blue">word read</Accent>?
          </>
        )
      }
      revealed={revealed}
      correct={result?.correct ?? false}
      disabled={disabled}
      ratingPreviews={card.rating_previews}
      onRate={handleRate}
      onContinue={handleContinue}
      answerForm={
        <div className="flex flex-col gap-5">
          <ConfirmedAnswersList answers={confirmedAlternates} />
          <AnswerForm
            answer={answer}
            onAnswerChange={setAnswer}
            onSubmit={handleCheck}
            placeholder="Type the reading…"
            disabled={disabled}
            accent="blue"
          />
        </div>
      }
      revealContent={
        result && (
          <div className="flex flex-col gap-3">
            <ConfirmedAnswersList answers={confirmedAlternates} subdued />
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
          </div>
        )
      }
    />
  );
}
