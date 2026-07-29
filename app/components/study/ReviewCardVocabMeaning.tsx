"use client";

import { useEffect, useState } from "react";
import type { DueCard, Rating, VocabularyRow } from "@/lib/types";
import { apiGet } from "@/lib/api/client";
import { RatingGrid } from "./RatingGrid";
import { Button } from "@/app/components/ui/Button";

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
    <div
      className={`relative w-full max-w-[560px] rounded-3xl border bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px] transition-[border-color,box-shadow] duration-300 ${
        flash === "correct"
          ? "border-accent-blue/50 shadow-[0_0_40px_rgba(0,210,255,0.15)]"
          : flash === "wrong"
            ? "border-accent-red/50 shadow-[0_0_40px_rgba(255,74,90,0.2)]"
            : "border-border-soft"
      }`}
    >
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-blue">Vocabulary meaning</div>
      <div className="mb-1.5 text-5xl font-extrabold">{card.word}</div>
      <div className="mb-1 text-[1.4rem] font-semibold text-text-muted">{card.kana_reading}</div>
      <div className={`mt-7 border-t border-border-soft pt-7 ${revealed ? "block" : "hidden"}`}>
        <div className="text-[1.3rem] font-bold text-white">{meanings ? meanings.join(", ") : "…"}</div>
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
