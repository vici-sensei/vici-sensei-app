"use client";

import { useState } from "react";
import type { DueCard, Rating } from "@/lib/types";
import { RatingGrid } from "./RatingGrid";

const FLASH_DELAY_MS = 350;

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardKanjiMeaning({ card, disabled, onRate }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);

  function handleRate(rating: Rating) {
    setFlash(rating >= 2 ? "correct" : "wrong");
    setTimeout(() => onRate(card, rating), FLASH_DELAY_MS);
  }

  return (
    <div className={`study-card${flash ? ` flash-${flash}` : ""}`}>
      <div className="card-type-tag">Kanji meaning</div>
      <div className="kanji-display">{card.kanji_char}</div>
      <div className={`reveal-block${revealed ? " show" : ""}`}>
        <div className="reveal-meanings">{card.kanji_meanings?.join(", ")}</div>
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
