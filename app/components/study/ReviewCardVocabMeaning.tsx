"use client";

import { useEffect, useState } from "react";
import type { DueCard, Rating, VocabularyRow } from "@/lib/types";
import { apiGet } from "@/lib/api/client";
import { RatingGrid } from "./RatingGrid";

const FLASH_DELAY_MS = 350;

// due_cards (get_due_cards RPC) doesn't include vocabulary.meanings for vocab_meaning
// rows — only word + kana_reading. Fetch it lazily per card, cached across re-visits (undo).
const meaningsCache = new Map<number, string[]>();

interface Props {
  card: DueCard;
  disabled: boolean;
  onRate: (card: DueCard, rating: Rating) => void;
}

export function ReviewCardVocabMeaning({ card, disabled, onRate }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
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

  function handleRate(rating: Rating) {
    setFlash(rating >= 2 ? "correct" : "wrong");
    setTimeout(() => onRate(card, rating), FLASH_DELAY_MS);
  }

  return (
    <div className={`study-card${flash ? ` flash-${flash}` : ""}`}>
      <div className="card-type-tag">Vocabulary meaning</div>
      <div className="word-display">{card.word}</div>
      <div className="kana-display">{card.kana_reading}</div>
      <div className={`reveal-block${revealed ? " show" : ""}`}>
        <div className="reveal-meanings">{meanings ? meanings.join(", ") : "…"}</div>
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
