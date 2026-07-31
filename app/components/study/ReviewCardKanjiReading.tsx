"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiReadingAnswer, type ReadingCheckResult } from "@/lib/study/kanjiReadingMatch";
import { RatingGrid } from "./RatingGrid";
import { Button } from "@/app/components/ui/Button";

const FLASH_DELAY_MS = 350;

function renderTargetWord(word: string, target: string): ReactNode {
  const idx = target ? word.indexOf(target) : -1;
  if (idx === -1) return word;
  return (
    <>
      {word.slice(0, idx)}
      <span className="text-accent-blue">{target}</span>
      {word.slice(idx + target.length)}
    </>
  );
}

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardKanjiReading({ card, disabled, onRate }: Props) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<ReadingCheckResult | null>(null);

  const revealed = result !== null;
  const flash = result === null ? null : result.correct ? "correct" : "wrong";

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    setResult(checkKanjiReadingAnswer(answer, card.kana_reading, card.romaji_reading, card.other_readings));
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
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-blue">Word reading</div>

      <div className="mb-2 text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none">{card.word ? renderTargetWord(card.word, card.kanji_char ?? "") : card.kanji_char}</div>
      <div className="mt-1 text-[0.85rem] text-text-muted">How is this word read?</div>

      {!revealed && (
        <form onSubmit={handleCheck} className="mt-7 flex flex-col items-center gap-3">
          <input
            autoFocus
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={disabled}
            placeholder="Type the reading…"
            className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-center text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button type="submit" variant="secondary" className="w-full" disabled={disabled || !answer.trim()}>
            Check
          </Button>
        </form>
      )}

      {revealed && (
        <div className="mt-7 border-t border-border-soft pt-7">
          <div className="text-[1.3rem] font-bold text-white">{card.kana_reading}</div>

          {!result.correct && (
            <div className="mt-5 rounded-lg border border-accent-red/20 bg-accent-red/[0.05] px-4 py-3 text-left">
              <div className="font-mono text-[1.05rem] leading-relaxed">
                <span className="text-accent-red">✗ </span>
                {result.userDiff.map((c, i) => (
                  <span key={i} className={c.match ? "text-white" : "text-accent-red line-through decoration-2"}>
                    {c.char}
                  </span>
                ))}
              </div>
              {result.targetDiff.length > 0 && (
                <div className="mt-1 font-mono text-[0.9rem] leading-relaxed text-text-muted">
                  {result.targetDiff.map((c, i) => (
                    <span key={i} className={c.match ? "" : "font-bold text-accent-blue"}>
                      {c.char}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-8.5">
        {revealed &&
          (result.correct ? (
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
