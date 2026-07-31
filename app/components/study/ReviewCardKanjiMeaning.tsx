"use client";

import { useState, type FormEvent } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { checkKanjiMeaningAnswer, type MeaningCheckResult } from "@/lib/study/kanjiMeaningMatch";
import { RatingGrid } from "./RatingGrid";
import { Button } from "@/app/components/ui/Button";

const FLASH_DELAY_MS = 350;

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardKanjiMeaning({ card, disabled, onRate }: Props) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<MeaningCheckResult | null>(null);

  const revealed = result !== null;
  const flash = result === null ? null : result.correct ? "correct" : "wrong";

  function handleCheck(event: FormEvent) {
    event.preventDefault();
    if (disabled || !answer.trim()) return;
    setResult(checkKanjiMeaningAnswer(answer, card.kanji_meanings ?? []));
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
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-blue">Kanji meaning</div>
      <div className="mb-2 text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none">{card.kanji_char}</div>

      <div className="mt-1 text-[0.85rem] text-text-muted">What does this kanji mean?</div>

      {!revealed && (
        <form onSubmit={handleCheck} className="mt-7 flex flex-col items-center gap-3">
          <input
            autoFocus
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={disabled}
            placeholder="Type a meaning…"
            className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-center text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button type="submit" variant="secondary" className="w-full" disabled={disabled || !answer.trim()}>
            Check
          </Button>
        </form>
      )}

      {revealed && (
        <div className="mt-7 border-t border-border-soft pt-7">
          <div className="text-[1.3rem] font-bold text-white">{card.kanji_meanings?.join(", ")}</div>

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
