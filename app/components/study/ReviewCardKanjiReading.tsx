"use client";

import type { DueCard, Rating } from "@/lib/types";
import { FaCheck } from "react-icons/fa6";
import { renderTargetWord } from "@/lib/study/furigana";
import { useKanjiReadingReviewCard } from "./useKanjiReadingReviewCard";
import { usePressableKanji } from "./usePressableKanji";
import { KanjiHint } from "./KanjiHint";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";
import { UsuallyKanaNote } from "@/app/components/ui/UsuallyKanaNote";
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
  const { answer, setAnswer, result, revealed, confirmedAlternates, lastAlternate, checkBlocked, handleCheck, handleRate, handleContinue } =
    useKanjiReadingReviewCard(card, disabled, onRate, onCancelableChange, card.drill_mode);

  // The follow-up question depends on what the last checkmark was for.
  const askingAgain = !revealed ? lastAlternate : null;
  const meanings = card.primary_word_meanings ?? [];

  // The word's other kanji open KanjiInfoModal on long-press -- the one being tested joins them
  // once the answer is revealed.
  const { renderKanji, longPressProps, kanjiModal, kanjiModalOpen, showKanjiHint } = usePressableKanji(
    card.word ?? "",
    revealed ? null : card.kanji_char
  );
  // While the modal is open the card counts as disabled: that switches off ReviewCardShell's
  // Enter/1/2/3 shortcuts, which would otherwise answer the card underneath it, and AnswerForm's
  // input -- which then refocuses itself once the modal closes, bringing the keyboard back.
  const shellDisabled = disabled || kanjiModalOpen;

  return (
    <ReviewCardShell
      label="Word reading"
      accent="blue"
      prompt={
        <>
          <div {...longPressProps}>
            <CardHeading furigana masked={!revealed}>
              {card.word
                ? renderTargetWord(card.word, card.kanji_char ?? "", card.furiganas, card.known_kanji_chars, renderKanji)
                : card.kanji_char}
            </CardHeading>
          </div>
          {showKanjiHint && <KanjiHint className="mb-1" />}
          {/* Shown once the answer is revealed, right or wrong -- a wrong answer is exactly when
              the student most needs to know which word they just missed. */}
          {revealed && meanings.length > 0 && (
            <p className="text-center text-sm italic text-text-muted">{meanings.join(", ")}</p>
          )}
          {card.usually_kana && (
            <div className="mt-1.5">
              <UsuallyKanaNote />
            </div>
          )}
          {kanjiModal}
        </>
      }
      subtitle={
        askingAgain?.kind === "meaning" ? (
          <>
            That&apos;s the correct meaning, but how is the <Accent accent="blue">word read</Accent>?
          </>
        ) : askingAgain?.kind === "kanji_reading_part" ? (
          <>
            That&apos;s the correct reading of {askingAgain.note}, but how is the <Accent accent="blue">whole word</Accent> read?
          </>
        ) : askingAgain?.kind === "kanji_reading_elsewhere" ? (
          <>
            That&apos;s a correct reading of {askingAgain.note}, but not the one used here. How is the{" "}
            <Accent accent="blue">word read</Accent>?
          </>
        ) : askingAgain ? (
          <>
            That&apos;s a correct reading, but what <Accent accent="blue">other reading</Accent> does this word have?
          </>
        ) : (
          <>
            How is this <Accent accent="blue">word read</Accent>?
          </>
        )
      }
      revealed={revealed}
      checkDisabled={checkBlocked || !answer.trim()}
      correct={result?.correct ?? false}
      disabled={shellDisabled}
      ratingPreviews={card.rating_previews}
      onRate={handleRate}
      onContinue={handleContinue}
      hideRatingOnCorrect={card.drill_mode}
      answerForm={
        <div className="flex flex-col gap-5">
          <ConfirmedAnswersList answers={confirmedAlternates} />
          <AnswerForm
            answer={answer}
            onAnswerChange={setAnswer}
            onSubmit={handleCheck}
            placeholder="Type the reading…"
            disabled={shellDisabled}
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
