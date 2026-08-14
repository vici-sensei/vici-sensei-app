"use client";

import { useEffect, useRef, useState } from "react";
import type { NewKanjiCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";
import { WordPreviewRow } from "./WordPreviewRow";

interface Props {
  candidate: NewKanjiCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanjiIntroCard({ candidate, disabled, onConfirm }: Props) {
  const words = candidate.words;
  const listRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const updateFade = () => {
      const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= 1;
      setShowFade(el.scrollHeight - el.clientHeight > 1 && !atBottom);
    };

    const observer = new ResizeObserver(updateFade);
    observer.observe(el);
    el.addEventListener("scroll", updateFade);
    updateFade();

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateFade);
    };
  }, []);

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
        <div className="relative mt-4 min-h-[100px]">
          <div
            ref={listRef}
            className="h-full max-h-full overflow-y-auto divide-y divide-border-soft rounded-xl border border-border-soft bg-white/[0.03] text-left"
          >
            {words.map((w) => (
              <WordPreviewRow key={w.id} vocabulary={w.vocabulary} />
            ))}
          </div>
          {showFade && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-bg-cards to-transparent"
            />
          )}
        </div>
      )}
      <div className="mt-4 shrink-0">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
