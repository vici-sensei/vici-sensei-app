"use client";

import { useState, type ReactNode } from "react";
import type { DueCard, Rating } from "@/lib/types";
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
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);

  function handleRate(rating: Rating) {
    setFlash(rating >= 2 ? "correct" : "wrong");
    setTimeout(() => onRate(card, rating), FLASH_DELAY_MS);
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
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-blue">Kanji reading</div>
      <div className="flex flex-col items-center gap-3.5">
        <div className="text-[clamp(3rem,8vw,4.5rem)] font-extrabold leading-none text-text-muted">{card.kanji_char}</div>
        <div className="text-[1.9rem] font-extrabold">
          {card.word ? renderTargetWord(card.word, card.kanji_char ?? "") : card.kanji_char}
        </div>
      </div>
      <div className="mt-1 text-[0.85rem] text-text-muted">How is this kanji read in this word?</div>
      <div className={`mt-7 border-t border-border-soft pt-7 ${revealed ? "block" : "hidden"}`}>
        <div className="text-[1.3rem] font-bold text-white">{card.kana_reading}</div>
      </div>
      <div className="mt-8.5">
        {!revealed && (
          <Button variant="secondary" className="w-full" onClick={() => setRevealed(true)}>
            Show answer
          </Button>
        )}
        <RatingGrid visible={revealed} disabled={disabled || flash !== null} onRate={handleRate} />
      </div>
    </div>
  );
}
