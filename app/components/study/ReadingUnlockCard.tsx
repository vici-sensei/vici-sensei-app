"use client";

import { useEffect } from "react";
import type { ReadingUnlockCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { WordPreviewRow } from "./WordPreviewRow";
import { KanjiHint } from "./KanjiHint";
import { usePressableKanji } from "./usePressableKanji";
import { useScrollHint } from "./useScrollHint";

interface Props {
  candidate: ReadingUnlockCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

/** A kanji the student already learned, with the words of it that were locked when it was
 * introduced and that their level now allows -- Next creates those words' Word reading cards,
 * which follow right after (see unlockReadings in useStudyQueue.ts). Same layout as
 * NewKanjiIntroCard, minus the readings chips: the kanji itself isn't new. */
export function ReadingUnlockCard({ candidate, disabled, onConfirm }: Props) {
  const words = candidate.words;
  const { ref: listRef, showFade, isScrollable, hasScrolledToBottom } = useScrollHint<HTMLDivElement>();
  const nextDisabled = disabled || (isScrollable && !hasScrolledToBottom);
  const { renderKanji, pressProps, kanjiModal, kanjiModalOpen, showKanjiHint } = usePressableKanji(
    words.map((w) => w.vocabulary.word).join(""),
    candidate.kanji
  );

  useEffect(() => {
    // Enter behind an open KanjiInfoModal would otherwise advance the card underneath it.
    if (nextDisabled || kanjiModalOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextDisabled, kanjiModalOpen, onConfirm]);

  return (
    <>
      <StudyCardShell
        label="Reading unlock"
        accent="gold"
        size="lg"
        layout="column"
        cornerBadge={
          candidate.level && <LevelBadge level={candidate.level} size="lg" className="absolute right-2 top-2 z-10" />
        }
      >
        <div className="shrink-0">
          <CardHeading>{candidate.kanji}</CardHeading>
          <div className="mb-2 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>
          <div className="text-[0.9rem] text-text-muted">
            {words.length === 1 ? "A new word with this kanji is unlocked:" : "New words with this kanji are unlocked:"}
          </div>
        </div>

        <div className="relative mt-4 min-h-[80px]">
          <div
            ref={listRef}
            {...pressProps}
            className="h-full max-h-full overflow-y-auto divide-y divide-border-soft rounded-xl border border-border-soft bg-white/[0.03] text-left"
          >
            {words.map((w) => (
              <WordPreviewRow key={w.id} vocabulary={w.vocabulary} renderKanji={renderKanji} />
            ))}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-xl bg-gradient-to-t from-[#111827] to-transparent transition-opacity duration-400 ease-out ${
              showFade ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
        <div className="mt-4 shrink-0">
          {showKanjiHint && <KanjiHint className="mb-3" />}
          <Button className="w-fit" disabled={nextDisabled} onClick={onConfirm}>
            Next
          </Button>
        </div>
      </StudyCardShell>
      {kanjiModal}
    </>
  );
}
