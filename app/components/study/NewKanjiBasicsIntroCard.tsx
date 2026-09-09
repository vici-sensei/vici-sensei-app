"use client";

import { useEffect } from "react";
import type { NewKanjiBasicsCandidate } from "@/lib/types";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { LevelRail } from "@/app/components/ui/LevelRail";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";
import { useScrollHint } from "./useScrollHint";

// Step 2's furigana demo word -- 毎日 (mainichi, "every day"), read per-kanji as まい + にち.
const FURIGANA_EXAMPLE_WORD = "毎日";
const FURIGANA_EXAMPLE_READINGS = ["まい", "にち"];

interface Props {
  candidate: NewKanjiBasicsCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

/** One-time, read-only 3-step lesson (kanji -> furigana -> JLPT levels) shown once, right before
 * a standard-track N5 student's very first "New kanji" card -- see
 * user_kanji_basics_progress/get_new_kanji_basics_candidates (20261022_kanji_basics_intro.sql).
 * Mirrors NewKanaRuleIntroCard: no grading, "Next" just marks this step permanently seen and it
 * never comes back. Every step's copy is fixed -- there's no reference-content table behind it,
 * unlike a kana rule. */
export function NewKanjiBasicsIntroCard({ candidate, disabled, onConfirm }: Props) {
  const { ref: bodyRef, showFade, isScrollable, hasScrolledToBottom } = useScrollHint<HTMLDivElement>();
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
    <StudyCardShell label={`New concept · Step ${candidate.id} of 3`} accent="gold" size="lg" layout="column">
      <div className="shrink-0">
        {candidate.id === 1 && <CardHeading>日</CardHeading>}
        {candidate.id === 2 && (
          <CardHeading furigana>{renderWordWithFurigana(FURIGANA_EXAMPLE_WORD, FURIGANA_EXAMPLE_READINGS)}</CardHeading>
        )}
        {candidate.id === 3 && (
          <div className="mb-2 flex justify-center">
            <LevelBadge level="N5" size="lg" />
          </div>
        )}
        <div className="mb-2 text-[1.3rem] font-bold text-white">
          {candidate.id === 1 && "What is kanji?"}
          {candidate.id === 2 && "What is furigana?"}
          {candidate.id === 3 && "JLPT levels"}
        </div>
      </div>

      <div className="relative mt-2 min-h-[110px]">
        <div ref={bodyRef} className="max-h-full overflow-y-auto text-left">
          {candidate.id === 1 && (
            <div className="space-y-3 text-[0.9rem] leading-relaxed text-text-muted">
              <p>
                Kanji are characters Japanese borrowed from Chinese to write most nouns, verbs, and adjectives. Unlike
                the hiragana/katakana you may already know, each kanji carries a <b className="text-white">meaning</b>{" "}
                of its own, not just a sound.
              </p>
              <div className="flex flex-wrap justify-center gap-2 py-1">
                <InfoChip>
                  山 <b>mountain</b>
                </InfoChip>
                <InfoChip>
                  水 <b>water</b>
                </InfoChip>
                <InfoChip>
                  火 <b>fire</b>
                </InfoChip>
              </div>
              <p>
                There are thousands of kanji in total, but you&apos;ll learn them a few at a time — starting right
                now, with your very first one.
              </p>
            </div>
          )}
          {candidate.id === 2 && (
            <div className="space-y-3 text-[0.9rem] leading-relaxed text-text-muted">
              <p>
                <b className="text-white">Furigana</b> is the small hiragana reading written above a kanji (like the
                example above), showing you exactly how to pronounce it.
              </p>
              <p>
                You&apos;ll see furigana above every kanji you haven&apos;t learned yet — once you&apos;ve mastered a
                reading, it stops needing the hint.
              </p>
              <p>Most Japanese words mix kanji and hiragana together; furigana always shows you the way through.</p>
            </div>
          )}
          {candidate.id === 3 && (
            <div className="space-y-3 text-[0.9rem] leading-relaxed text-text-muted">
              <p>
                <b className="text-white">JLPT</b> (Japanese-Language Proficiency Test) has 5 official levels, from{" "}
                <b className="text-white">N5</b> (the easiest) to <b className="text-white">N1</b> (fluent).
              </p>
              {/* A plain wrapper, not LevelRail directly, so its own mt-7/mb-6 margins survive --
                  as a direct child of this space-y-3 div, the parent's own margin-top/bottom rule
                  would otherwise win on specificity and collapse LevelRail's spacing down to
                  space-y-3's 0.75rem/0. The extra pt-3 gives LevelRail's absolutely-positioned
                  "You are here" label (which pokes up above its own box) clearance from the
                  paragraph above, without changing LevelRail itself for onboarding's own usage. */}
              <div className="pt-3">
                <LevelRail />
              </div>
              <p>
                You&apos;re starting at <b className="text-white">N5</b> — the foundation everyone builds on. As you
                master its kanji and vocabulary, you&apos;ll unlock N4, then N3, and so on.
              </p>
            </div>
          )}
        </div>
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111827] to-transparent transition-opacity duration-400 ease-out ${
            showFade ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="mt-4 shrink-0">
        <Button className="min-w-[min(220px,100%)]" disabled={nextDisabled} onClick={onConfirm}>
          {candidate.id === 3 ? "Let's start!" : "Next"}
        </Button>
      </div>
    </StudyCardShell>
  );
}
