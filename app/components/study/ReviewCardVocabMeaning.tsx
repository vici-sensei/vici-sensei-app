"use client";

import type { DueCard, Rating } from "@/lib/types";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { useVocabMeaningReviewCard } from "./useVocabMeaningReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { CardHeading } from "./CardHeading";
import { Accent } from "./Accent";
import { AnswerForm } from "./AnswerForm";
import { MeaningList } from "./MeaningList";
import { TokenDiffList } from "./TokenDiffList";
import { ConfirmedAnswersList } from "./ConfirmedAnswersList";

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
  onCancelableChange?: (cancel: (() => void) | null) => void;
}

export function ReviewCardVocabMeaning({ card, disabled, onRate, onCancelableChange }: Props) {
  const { answer, setAnswer, result, revealed, confirmedAlternates, handleCheck, handleRate, handleContinue } =
    useVocabMeaningReviewCard(card, disabled, onRate, onCancelableChange);

  const askingForAnother = confirmedAlternates.length > 0 && !revealed;

  return (
    <ReviewCardShell
      label="Vocabulary"
      accent="orange"
      prompt={
        // Furigana stays hidden until the card is revealed -- otherwise the student can read the
        // word aloud from its kana and recall the meaning by sound, never actually recognizing the
        // kanji itself (the whole point of this card, unlike "Word reading" which tests the
        // reading directly). `furigana` on CardHeading still reserves the same vertical space
        // either way, so revealing doesn't shift the kanji down.
        <CardHeading furigana masked={!revealed}>
          {card.word ? renderWordWithFurigana(card.word, revealed ? card.furiganas : null) : card.word}
        </CardHeading>
      }
      subtitle={
        askingForAnother ? (
          <>
            What <Accent accent="orange">other meaning</Accent> does this word have?
          </>
        ) : (
          <>
            What does this <Accent accent="orange">word mean</Accent>?
          </>
        )
      }
      revealed={revealed}
      checkDisabled={disabled || !answer.trim()}
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
            placeholder="Type a meaning…"
            disabled={disabled}
            accent="orange"
          />
        </div>
      }
      revealContent={
        result && (
          <div className="flex flex-col gap-3">
            <ConfirmedAnswersList answers={confirmedAlternates} subdued />
            <MeaningList meanings={card.word_meanings ?? []} matchedMeanings={result.matchedMeanings} correct={result.correct} />
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </div>
        )
      }
    />
  );
}
