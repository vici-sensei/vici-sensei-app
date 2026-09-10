"use client";

import { useEffect } from "react";
import { FaArrowRight } from "react-icons/fa6";
import type { NewHiraganaCandidate, NewKatakanaCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { StudyCardShell } from "./StudyCardShell";

interface Props {
  candidate: NewHiraganaCandidate | NewKatakanaCandidate;
  /** Which set this candidate is from -- drives the card label only, the shape (character + romaji, no example word/audio for this version) is identical either way. */
  script: "hiragana" | "katakana";
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanaIntroCard({ candidate, script, disabled, onConfirm }: Props) {
  useEffect(() => {
    if (disabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onConfirm]);

  // Dakuten/handakuten characters (が, ぱ, ...) are shown paired with the seion base they're
  // derived from (か, は, ...) so the card reads "か ka → が ga" instead of just "が ga" -- see
  // NewHiraganaCandidate.base_character (20261021_new_kana_candidates_base_pair.sql).
  const showBasePair =
    (candidate.kana_type === "dakuten" || candidate.kana_type === "handakuten") &&
    candidate.base_character !== null &&
    candidate.base_romaji !== null;

  return (
    <StudyCardShell label={script === "hiragana" ? "New hiragana" : "New katakana"} accent="gold">
      {showBasePair ? (
        <div className="mb-2 flex items-center justify-center gap-4">
          <div>
            <div className="mb-2 text-4xl leading-none">{candidate.base_character}</div>
            <div className="text-[1.3rem] font-bold text-white">{candidate.base_romaji}</div>
          </div>
          <FaArrowRight className="h-6 w-6 shrink-0 text-text-muted" aria-hidden />
          <div>
            <div className="mb-2 text-4xl leading-none">{candidate.character}</div>
            <div className="text-[1.3rem] font-bold text-white">{candidate.romaji}</div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 text-4xl leading-none">{candidate.character}</div>
          <div className="text-[1.3rem] font-bold text-white">{candidate.romaji}</div>
        </>
      )}

      <div className="mt-8.5">
        <Button className="w-fit" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
