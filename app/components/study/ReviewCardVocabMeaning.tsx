"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { DueCard, Rating, VocabularyRow } from "@/lib/types";
import { apiGet } from "@/lib/api/client";
import { checkKanjiMeaningAnswer, type MeaningCheckResult } from "@/lib/study/kanjiMeaningMatch";
import { RatingGrid } from "./RatingGrid";
import { Button } from "@/app/components/ui/Button";

const FLASH_DELAY_MS = 350;

interface FuriganaSegment {
  text: string;
  furigana: string | null;
}

function buildFuriganaSegments(word: string, furiganas: string[] | null | undefined): FuriganaSegment[] {
  const chars = Array.from(word);
  if (!furiganas || furiganas.length !== chars.length) {
    return [{ text: word, furigana: null }];
  }
  const segments: FuriganaSegment[] = [];
  let i = 0;
  while (i < chars.length) {
    const reading = furiganas[i];
    if (reading && reading !== "-") {
      let j = i + 1;
      while (j < chars.length && furiganas[j] === "-") j++;
      segments.push({ text: chars.slice(i, j).join(""), furigana: reading });
      i = j;
    } else {
      segments.push({ text: chars[i], furigana: null });
      i++;
    }
  }
  return segments;
}

function renderWordWithFurigana(word: string, furiganas: string[] | null | undefined): ReactNode {
  return buildFuriganaSegments(word, furiganas).map((segment, i) =>
    segment.furigana ? (
      <ruby key={i}>
        {segment.text}
        <rt
          className={`mb-4 text-[0.3em] font-normal text-text-muted ${
            segment.text.length > 1 ? "rounded-md bg-white/5 px-1 pb-1" : ""
          }`}
        >
          {segment.furigana}
        </rt>
      </ruby>
    ) : (
      <span key={i}>{segment.text}</span>
    )
  );
}

// due_cards (get_due_cards RPC) doesn't include vocabulary.meanings for vocab_meaning
// rows — only word + kana_reading. Fetch it lazily per card, cached across re-visits (undo).
const meaningsCache = new Map<number, string[]>();

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardVocabMeaning({ card, disabled, onRate }: Props) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<MeaningCheckResult | null>(null);
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

  const revealed = result !== null;
  const flash = result === null ? null : result.correct ? "correct" : "wrong";
  const meaningsLoading = meanings === null;

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || meaningsLoading || !answer.trim()) return;
    setResult(checkKanjiMeaningAnswer(answer, meanings ?? []));
  }

  function handleRate(rating: Rating) {
    setTimeout(() => onRate(card, rating), FLASH_DELAY_MS);
  }

  function handleContinue() {
    setTimeout(() => onRate(card, 0), FLASH_DELAY_MS);
  }

  return (
    <div
      className={`relative w-full max-w-[560px] rounded-3xl border bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px] transition-[border-color,box-shadow] duration-300 ${
        flash === "correct"
          ? "border-accent-blue/50 shadow-[0_0_40px_rgba(0,210,255,0.15)]"
          : flash === "wrong"
            ? "border-accent-red/50 shadow-[0_0_40px_rgba(255,74,90,0.2)]"
            : "border-border-soft"
      }`}
    >
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-blue">Vocabulary</div>

      <div className="mb-2 pt-[0.6em] text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none">
        {card.word ? renderWordWithFurigana(card.word, card.furiganas) : card.word}
      </div>

      <div className="mt-1 text-[0.85rem] text-text-muted">What does this word mean?</div>

      {!revealed && (
        <form onSubmit={handleCheck} className="mt-7 flex flex-col items-center gap-3">
          <input
            autoFocus
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={disabled || meaningsLoading}
            placeholder="Type a meaning…"
            className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-center text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button
            type="submit"
            variant="secondary"
            className="w-full"
            disabled={disabled || meaningsLoading || !answer.trim()}
          >
            Check
          </Button>
        </form>
      )}

      {revealed && (
        <div className="mt-7 border-t border-border-soft pt-7">
          <div className="text-[1.3rem] font-bold text-white">{meanings ? meanings.join(", ") : "…"}</div>

          {!result.correct && (
            <div className="mt-5 space-y-2.5 text-left">
              {result.tokens.map((token, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-4 py-3 ${
                    token.correct ? "border-accent-blue/20 bg-accent-blue/[0.05]" : "border-accent-red/20 bg-accent-red/[0.05]"
                  }`}
                >
                  <div className="font-mono text-[1.05rem] leading-relaxed">
                    {token.correct ? (
                      <span className="text-accent-blue">✓ {token.raw}</span>
                    ) : (
                      <>
                        <span className="text-accent-red">✗ </span>
                        {token.userDiff?.map((c, ci) => (
                          <span
                            key={ci}
                            className={c.match ? "text-white" : "text-accent-red line-through decoration-2"}
                          >
                            {c.char}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                  {!token.correct && token.targetDiff && (
                    <div className="mt-1 font-mono text-[0.9rem] leading-relaxed text-text-muted">
                      {token.targetDiff.map((c, ci) => (
                        <span key={ci} className={c.match ? "" : "font-bold text-accent-blue"}>
                          {c.char}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-8.5">
        {revealed && (result.correct ? (
          <RatingGrid visible disabled={disabled} hideAgain onRate={handleRate} />
        ) : (
          <Button variant="secondary" className="w-full" disabled={disabled} onClick={handleContinue}>
            Continue
          </Button>
        ))}
      </div>
    </div>
  );
}
