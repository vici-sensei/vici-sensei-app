"use client";

import { useEffect, useRef, useState } from "react";
import type { NewKanjiCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { renderWordWithFurigana } from "@/lib/study/furigana";

interface Props {
  candidate: NewKanjiCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanjiIntroCard({ candidate, disabled, onConfirm }: Props) {
  const words = candidate.words;
  const listRef = useRef<HTMLDivElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);

  const updateScrollState = () => {
    const el = listRef.current;
    if (!el) return;
    setHasMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
  };

  useEffect(() => {
    updateScrollState();
  }, [words]);

  // TO DO - h-[540px] md:h-[715px]

  return (
    <div className="relative w-full max-w-[620px] rounded-3xl border border-border-soft bg-bg-cards px-4 py-4 md:px-10 md:py-14 text-center backdrop-blur-[10px]">
      {candidate.level && (
        <LevelBadge level={candidate.level} size="lg" className="absolute right-2 top-2 md:right-4 md:top-4 z-10" />
      )}
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-gold">New kanji</div>

      <div className="mb-2 text-[clamp(4rem,12vw,6.5rem)] font-medium leading-none">{candidate.kanji}</div>

      <div className="mb-2 md:mb-2.5 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>

      <div className="mb-4 md:mb-2 flex flex-wrap justify-center gap-2 md:gap-2.5">
        {candidate.kun_readings && candidate.kun_readings.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 md:py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
            Kun: <b>{candidate.kun_readings.join("、")}</b>
          </div>
        )}
        {candidate.on_readings && candidate.on_readings.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 md:py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
            On: <b>{candidate.on_readings.join("、")}</b>
          </div>
        )}
      </div>

      {/* TO DO - h-[105px] md:h-[130px]        
      h-full max-h-full overflow-y-auto min-h-[105px] md:min-h-[130px]  */}

      {words.length > 0 && (
        <div className="relative mt-4 md:mt-7">
          <div
            ref={listRef}
            onScroll={updateScrollState}
            className="divide-y divide-border-soft rounded-xl border border-border-soft bg-white/[0.03] text-left"
          >
            {words.map((w) => (
              <div className="flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3.5" key={w.id}>
                <div className="shrink-0 pt-[0.6em] text-3xl leading-none md:text-4xl">
                  {renderWordWithFurigana(w.vocabulary.word, w.vocabulary.furiganas)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="leading-[1.4] text-text-muted">{w.vocabulary.meanings?.join(", ")}</div>
                  {w.vocabulary.usually_kana && (
                    <div className="mt-1 text-xs font-semibold italic text-accent-blue/70">
                      usually written in kana
                    </div>
                  )}
                </div>
                {w.vocabulary.jlpt_level && <LevelBadge level={w.vocabulary.jlpt_level} size="sm" className="shrink-0" />}
              </div>
            ))}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-xl bg-gradient-to-t from-bg-cards to-transparent transition-opacity duration-200 ${
              hasMoreBelow ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}
      <div className="mt-4 md:mt-8.5">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </div>
  );
}
