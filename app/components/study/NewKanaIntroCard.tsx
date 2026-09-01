"use client";

import { useEffect } from "react";
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

  return (
    <StudyCardShell label={script === "hiragana" ? "New hiragana" : "New katakana"} accent="gold">
      <div className="mb-2 text-4xl leading-none">{candidate.character}</div>
      <div className="text-[1.3rem] font-bold text-white">{candidate.romaji}</div>

      <div className="mt-8.5">
        <Button className="min-w-[min(220px,100%)]" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
