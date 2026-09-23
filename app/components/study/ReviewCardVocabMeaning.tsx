"use client";

import type { DueCard, Rating } from "@/lib/types";
import { renderVocabularyWord, vocabularyDisplayText } from "@/lib/study/furigana";
import { useVocabMeaningReviewCard } from "./useVocabMeaningReviewCard";
import { usePressableKanji } from "./usePressableKanji";
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
    useVocabMeaningReviewCard(card, disabled, onRate, onCancelableChange, card.drill_mode);

  const askingForAnother = confirmedAlternates.length > 0 && !revealed;

  // The word's kanji open KanjiInfoModal on long-press -- but only in a word of more than one
  // character: a single kanji's own meaning is the very answer this card asks for.
  const displayedWord = card.word ? vocabularyDisplayText({ ...card, word: card.word }) : "";
  const { renderKanji, longPressProps, kanjiModal, kanjiModalOpen } = usePressableKanji(
    Array.from(displayedWord).length > 1 ? displayedWord : "",
    null
  );
  // While the modal is open the card counts as disabled -- see ReviewCardKanjiReading.
  const shellDisabled = disabled || kanjiModalOpen;

  return (
    <ReviewCardShell
      label="Vocabulary"
      accent="orange"
      prompt={
        <>
          <div {...longPressProps}>
            <CardHeading furigana masked={!revealed}>
              {card.word
                ? renderVocabularyWord({ ...card, word: card.word }, undefined, undefined, undefined, renderKanji)
                : card.word}
            </CardHeading>
          </div>
          {kanjiModal}
        </>
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
      checkDisabled={shellDisabled || !answer.trim()}
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
            placeholder="Type a meaning…"
            disabled={shellDisabled}
            accent="orange"
          />
        </div>
      }
      revealContent={
        result && (
          <div className="flex flex-col gap-3">
            <ConfirmedAnswersList answers={confirmedAlternates} subdued />
            <MeaningList meanings={card.primary_word_meanings ?? []} matchedMeanings={result.matchedMeanings} correct={result.correct} />
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </div>
        )
      }
    />
  );
}
