"use client";

import { useState, type ReactNode } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { RatingGrid } from "./RatingGrid";

const FLASH_DELAY_MS = 350;

function renderTargetWord(word: string, target: string): ReactNode {
  const idx = target ? word.indexOf(target) : -1;
  if (idx === -1) return word;
  return (
    <>
      {word.slice(0, idx)}
      <span className="target">{target}</span>
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
    <div className={`study-card${flash ? ` flash-${flash}` : ""}`}>
      <div className="card-type-tag">Kanji reading</div>
      <div className="reading-combo">
        <div className="rc-kanji">{card.kanji_char}</div>
        <div className="rc-word">{card.word ? renderTargetWord(card.word, card.kanji_char ?? "") : card.kanji_char}</div>
      </div>
      <div className="rc-hint">How is this kanji read in this word?</div>
      <div className={`reveal-block${revealed ? " show" : ""}`}>
        <div className="reveal-meanings">{card.kana_reading}</div>
      </div>
      <div className="study-actions">
        {!revealed && (
          <button type="button" className="btn-secondary show-answer-btn" onClick={() => setRevealed(true)}>
            Show answer
          </button>
        )}
        <RatingGrid visible={revealed} disabled={disabled || flash !== null} onRate={handleRate} />
      </div>
    </div>
  );
}
