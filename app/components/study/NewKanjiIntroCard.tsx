"use client";

import { useEffect, useState } from "react";
import type { NewKanjiCandidate } from "@/lib/types";
import { prefetchKanjiInfo } from "@/lib/client-data/kanji";
import { isKanjiChar } from "@/lib/study/furigana";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";
import { KanjiInfoModal } from "./KanjiInfoModal";
import { WordPreviewRow } from "./WordPreviewRow";
import { useKanjiLongPress } from "./useKanjiLongPress";
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
  // The kanji long-pressed in the word list, shown in KanjiInfoModal until it's dismissed.
  const [inspectedKanji, setInspectedKanji] = useState<string | null>(null);
  const longPressProps = useKanjiLongPress(setInspectedKanji);

  // Words arrive after the card may already be on screen (see fetchStudyQueue's
  // onKanjiWordsReady), so this re-runs once they do -- one query for every kanji in the list.
  const wordKanjiKey = words
    .flatMap((w) => Array.from(w.vocabulary.word))
    .filter(isKanjiChar)
    .join("");
  useEffect(() => {
    if (wordKanjiKey) prefetchKanjiInfo(Array.from(wordKanjiKey));
  }, [wordKanjiKey]);

  useEffect(() => {
    // Enter behind an open KanjiInfoModal would otherwise advance the card underneath it.
    if (nextDisabled || inspectedKanji) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextDisabled, inspectedKanji, onConfirm]);

  return (
    <>
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
              {...longPressProps}
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
          <Button className="w-fit" disabled={nextDisabled} onClick={onConfirm}>
            Next
          </Button>
        </div>
      </StudyCardShell>
      {inspectedKanji && <KanjiInfoModal kanji={inspectedKanji} onClose={() => setInspectedKanji(null)} />}
    </>
  );
}
