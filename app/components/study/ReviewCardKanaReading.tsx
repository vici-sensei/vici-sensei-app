"use client";

import type { DueCard, Rating } from "@/lib/types";
import { FaCheck } from "react-icons/fa6";
import { checkKanaReadingAnswer } from "@/lib/study/kanaReadingMatch";
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

/** Shared by hiragana_reading and katakana_reading -- structurally identical, only the
 * label/accent differ, same reasoning as ReviewCardKanjiReading but without word-level
 * concerns (siblings, furigana): a kana character tests exactly one fixed romaji string. */
export function ReviewCardKanaReading({ card, disabled, onRate, onCancelableChange }: Props) {
  const isHiragana = card.exercise_type === "hiragana_reading";
  // 'learning' means this character hasn't graduated the post-introduction drill yet (see
  // useStudyQueue.ts's rate()/submitDrillAnswer and record_hiragana_drill_result) -- no
  // Hard/Good/Easy picker, graded purely on typed-answer correctness, repeats until answered
  // right 3 times in a row.
  const drillMode = card.status === "learning";
  const { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanaReadingAnswer(input, card.kana_romaji ?? ""),
    onCancelableChange,
    drillMode
  );

  return (
    <ReviewCardShell
      label={isHiragana ? "Hiragana reading" : "Katakana reading"}
      accent={isHiragana ? "violet" : "orange"}
      prompt={<CardHeading masked={!revealed}>{card.kana_character}</CardHeading>}
      subtitle={
        <>
          How is this <Accent accent={isHiragana ? "violet" : "orange"}>character read</Accent>?
        </>
      }
      revealed={revealed}
      correct={result?.correct ?? false}
      disabled={disabled}
      ratingPreviews={card.rating_previews}
      onRate={handleRate}
      onContinue={handleContinue}
      hideRatingOnCorrect={drillMode}
      answerForm={
        <AnswerForm
          answer={answer}
          onAnswerChange={setAnswer}
          onSubmit={handleCheck}
          placeholder="Type the romaji…"
          disabled={disabled}
          accent={isHiragana ? "violet" : "orange"}
        />
      }
      revealContent={
        result && (
          <div className="flex flex-col gap-3">
            {result.correct && (
              <div className="flex items-center justify-center gap-2 text-[1.3rem] font-bold text-white">
                <FaCheck className="text-accent-green" />
                <span>{card.kana_romaji}</span>
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
