"use client";

import { useEffect, useState } from "react";
import type { DueCard, Rating, VocabularyRow } from "@/lib/types";
import { apiGet } from "@/lib/api/client";
import { checkKanjiMeaningAnswer } from "@/lib/study/kanjiMeaningMatch";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { useTypedReviewCard } from "./useTypedReviewCard";
import { ReviewCardShell } from "./ReviewCardShell";
import { AnswerForm } from "./AnswerForm";
import { TokenDiffList } from "./TokenDiffList";

// due_cards (get_due_cards RPC) doesn't include vocabulary.meanings for vocab_meaning
// rows — only word + kana_reading. Fetch it lazily per card, cached across re-visits (undo).
const meaningsCache = new Map<number, string[]>();

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardVocabMeaning({ card, disabled, onRate }: Props) {
  const [meanings, setMeanings] = useState<string[] | null>(
    card.word_id != null ? meaningsCache.get(card.word_id) ?? null : null
  );

  useEffect(() => {
    if (card.word_id == null || meaningsCache.has(card.word_id)) return;
    let cancelled = false;
    apiGet<VocabularyRow>(`/api/vocabulary/${card.word_id}`)
      .then((data) => {
        if (cancelled) return;
        const list = data.meanings ?? [];
        meaningsCache.set(card.word_id!, list);
        setMeanings(list);
      })
      .catch(() => {
        if (!cancelled) setMeanings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [card.word_id]);

  const meaningsLoading = meanings === null;

  const { answer, setAnswer, result, revealed, flash, handleCheck, handleRate, handleContinue } = useTypedReviewCard(
    card,
    disabled || meaningsLoading,
    onRate,
    (input) => checkKanjiMeaningAnswer(input, meanings ?? [])
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
          disabled={disabled || meaningsLoading}
        />
      }
      revealContent={
        result && (
          <>
            <div className="text-[1.3rem] font-bold text-white">{meanings ? meanings.join(", ") : "…"}</div>
            {!result.correct && <TokenDiffList tokens={result.tokens} />}
          </>
        )
      }
    />
  );
}
