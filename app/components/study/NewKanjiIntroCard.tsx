"use client";

import { useEffect } from "react";
import type { NewKanjiCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";
import { WordPreviewRow } from "./WordPreviewRow";
import { useScrollHint } from "./useScrollHint";

interface Props {
  candidate: NewKanjiCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanjiIntroCard({ candidate, disabled, onConfirm }: Props) {
  const words = candidate.words;
  const { ref: listRef, showFade, isScrollable, hasScrolledToBottom } = useScrollHint<HTMLDivElement>();
  const nextDisabled = disabled || (isScrollable && !hasScrolledToBottom);

  useEffect(() => {
    if (nextDisabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextDisabled, onConfirm]);

  return (
    <StudyCardShell
      label="New kanji"
      accent="gold"
      size="lg"
      layout="column"
      cornerBadge={
        candidate.level && (
          <LevelBadge level={candidate.level} size="lg" className="absolute right-2 top-2 z-10" />
        )
      }
    >
      <div className="shrink-0">
        <CardHeading>{candidate.kanji}</CardHeading>

        <div className="mb-2 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>

        <div className="flex flex-wrap justify-center gap-2">
          {candidate.kun_readings && candidate.kun_readings.length > 0 && (
            <InfoChip>
              Kun: <b>{candidate.kun_readings.join("、")}</b>
            </InfoChip>
          )}
          {candidate.on_readings && candidate.on_readings.length > 0 && (
            <InfoChip>
              On: <b>{candidate.on_readings.join("、")}</b>
            </InfoChip>
          )}
        </div>
      </div>

      {words.length > 0 && (
        <div className="relative mt-4 min-h-[130px]">
          <div
            ref={listRef}
            className="h-full max-h-full overflow-y-auto divide-y divide-border-soft rounded-xl border border-border-soft bg-white/[0.03] text-left"
          >
            {words.map((w) => (
              <WordPreviewRow key={w.id} vocabulary={w.vocabulary} />
            ))}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-xl bg-gradient-to-t from-[#111827] to-transparent transition-opacity duration-400 ease-out ${
              showFade ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}
      <div className="mt-4 shrink-0">
        <Button className="min-w-[min(220px,100%)]" disabled={nextDisabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
