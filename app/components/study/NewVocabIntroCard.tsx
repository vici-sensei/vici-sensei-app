"use client";

import { useEffect } from "react";
import type { NewVocabCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";

interface Props {
  candidate: NewVocabCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewVocabIntroCard({ candidate, disabled, onConfirm }: Props) {
  const isUsuallyKana = candidate.usually_kana === true;

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
    <StudyCardShell label="New word" accent="gold">
      <CardHeading furigana>
        {isUsuallyKana ? candidate.kana_reading : renderWordWithFurigana(candidate.word, candidate.furiganas)}
      </CardHeading>

      <div className="mb-2.5 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>

      <div className="mt-2.5 flex flex-wrap justify-center gap-2">
        {candidate.parts_of_speech?.map((pos) => <InfoChip key={pos}>{pos}</InfoChip>)}
        {candidate.jlpt_level && <LevelBadge level={candidate.jlpt_level} size="md" />}
      </div>

      <div className="mt-8.5">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
