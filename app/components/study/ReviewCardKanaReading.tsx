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
  // Server-computed (get_due_cards/get_hiragana_reading_cards/get_katakana_reading_cards --
  // status = 'learning' and kana_type = 'seion') so this always agrees with useStudyQueue.ts's
  // rate(), which routes on the same flag -- see card.drill_mode's own doc comment. True means
  // this character hasn't graduated the post-introduction drill yet (see
  // useStudyQueue.ts's rate()/submitDrillAnswer and record_hiragana_drill_result) -- no
  // Hard/Good/Easy picker, graded purely on typed-answer correctness, repeats until answered
  // right 3 times in a row.
  const drillMode = card.drill_mode;
  const { answer, setAnswer, result, revealed, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled,
    onRate,
    (input) => checkKanaReadingAnswer(input, card.kana_romaji ?? ""),
    onCancelableChange,
    drillMode
  );
  // card.drill_streak is the streak as of when this card was fetched (i.e. before this
  // attempt) -- see get_due_cards/get_hiragana_reading_cards/get_katakana_reading_cards.
  // A correct answer counts one further than that; a wrong one resets to 0, matching
  // record_hiragana_drill_result/record_katakana_drill_result's own behavior.
  const streakAfterThisAnswer = result ? (result.correct ? (card.drill_streak ?? 0) + 1 : 0) : null;

  return (
    <ReviewCardShell
      label={isHiragana ? "Hiragana reading" : "Katakana reading"}
      accent={isHiragana ? "violet" : "orange"}
      prompt={
        <CardHeading furigana={revealed && !result?.correct} masked={!revealed}>
          {revealed && !result?.correct ? (
            <ruby>
              {card.kana_character}
              <rt className="mb-[0.5em] select-none text-base font-normal text-text-muted">{card.kana_romaji}</rt>
            </ruby>
          ) : (
            card.kana_character
          )}
        </CardHeading>
      }
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
            {drillMode && streakAfterThisAnswer !== null && (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`h-2.5 w-2.5 rounded-full ${
                        i < streakAfterThisAnswer
                          ? isHiragana
                            ? "bg-accent-violet"
                            : "bg-accent-orange"
                          : "bg-border-soft"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[0.85rem] text-text-muted">
                  {streakAfterThisAnswer} in a row{streakAfterThisAnswer < 3 ? " — need 3" : ""}
                </span>
              </div>
            )}
          </div>
        )
      }
    />
  );
}
