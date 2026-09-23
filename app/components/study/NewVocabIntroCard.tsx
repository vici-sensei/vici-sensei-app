"use client";

import { useEffect } from "react";
import type { NewVocabCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { renderVocabularyWord, vocabularyDisplayText } from "@/lib/study/furigana";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";
import { usePressableKanji } from "./usePressableKanji";

interface Props {
  candidate: NewVocabCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewVocabIntroCard({ candidate, disabled, onConfirm }: Props) {
  // Every kanji of the word opens KanjiInfoModal on long-press -- none when it's shown as kana only.
  const { renderKanji, longPressProps, kanjiModal, kanjiModalOpen } = usePressableKanji(
    vocabularyDisplayText(candidate),
    null
  );

  useEffect(() => {
    // Enter behind an open KanjiInfoModal would otherwise advance the card underneath it.
    if (disabled || kanjiModalOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, kanjiModalOpen, onConfirm]);

  return (
    <>
      <StudyCardShell label="New word" accent="gold">
        <div {...longPressProps}>
          <CardHeading furigana>
            {renderVocabularyWord(candidate, undefined, undefined, undefined, renderKanji)}
          </CardHeading>
        </div>

        <div className="mb-2.5 text-[1.3rem] font-bold text-white">{candidate.primary_meanings?.join(", ")}</div>

        <div className="mt-2.5 flex flex-wrap justify-center gap-2">
          {candidate.parts_of_speech?.map((pos) => <InfoChip key={pos}>{pos}</InfoChip>)}
          {candidate.jlpt_level && <LevelBadge level={candidate.jlpt_level} size="md" />}
        </div>

        <div className="mt-8.5">
          <Button className="w-fit" disabled={disabled} onClick={onConfirm}>
            Next
          </Button>
        </div>
      </StudyCardShell>
      {kanjiModal}
    </>
  );
}
