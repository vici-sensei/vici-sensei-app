"use client";

import { useEffect, useMemo } from "react";
import { FaCheck } from "react-icons/fa6";
import { checkKanaReadingAnswer } from "@/lib/study/kanaReadingMatch";
import {
  buildFullRomajiFuriganas,
  renderReadingTestSentence,
} from "@/lib/study/readingTestFurigana";
import { TokenDiffList } from "@/app/components/study/TokenDiffList";
import type { ReadingTestAnswer } from "@/lib/data/readingTest";
import type { ReadingTestSentence } from "@/lib/types";

interface Props {
  sentence: ReadingTestSentence;
  kanaRomajiMap: Map<string, string> | null;
  testType: string;
  /** This sentence's already-persisted result, if Check already ran for it (any device, any
   * earlier session, or the sibling ReadingTestAnswerForm just now) -- reactive, not just an
   * initial seed: the parent page passes the same live progress map both components read, so this
   * flips from null to a value the moment Check succeeds, without this row needing to remount. */
  initialAnswer: ReadingTestAnswer | null;
  /** Fired when the student presses Enter once a result is showing -- a click on the page's own
   * Next button calls the same handler directly. */
  onNext: () => void;
  /** Reports this row's placeholder div -- the romaji input's original spot, right after the
   * sentence -- so the sibling ReadingTestAnswerForm can portal the actual input element into it
   * (see that component's doc comment for why a portal instead of just rendering it here). Fires
   * with null on unmount. */
  onAnswerSlotReady: (el: HTMLDivElement | null) => void;
}

/** One question of the reading test, shown one at a time by the test page: the fixed hiragana
 * sentence plus, once answered, the correct/incorrect result. The romaji input/Check button and
 * the Next button that follows are owned by the page itself -- this row only exposes, via
 * `onAnswerSlotReady`, the placeholder where the input lands while the on-screen keyboard is
 * closed. The caller always mounts a fresh instance per question (key={sentence.id}), which is
 * what makes the Enter-to-advance listener below reset cleanly between questions. */
export function ReadingTestSentenceRow({
  sentence,
  kanaRomajiMap,
  testType,
  initialAnswer,
  onNext,
  onAnswerSlotReady,
}: Props) {
  const result = useMemo(
    () =>
      initialAnswer
        ? checkKanaReadingAnswer(initialAnswer.userAnswer, sentence.romaji)
        : null,
    [initialAnswer, sentence.romaji],
  );

  // Lets Enter advance to the next question on desktop without requiring a click, even when focus
  // isn't on the Next button itself (the input that just blurred, for instance). Skipped when a
  // button already has focus -- that Enter press is already handled by the button's own native
  // activation, and letting both fire would call onNext twice.
  useEffect(() => {
    if (!result) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        document.activeElement instanceof HTMLButtonElement
      )
        return;
      onNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result, onNext]);

  const build = useMemo(
    () =>
      kanaRomajiMap
        ? buildFullRomajiFuriganas(
            sentence.question,
            kanaRomajiMap,
            sentence.particle_furiganas,
          )
        : null,
    [kanaRomajiMap, sentence.question, sentence.particle_furiganas],
  );

  // Which positions get the always-shown/blue hint treatment: は/を/へ particle overrides, same as
  // always, plus -- hiragana test only -- build.choonpuHints. Chōonpu (ー) doesn't occur in
  // standard hiragana at all, so a hiragana word using it genuinely needs the reading spelled out,
  // same category as a particle exception. Katakana uses ー constantly, so hinting every
  // occurrence there would give away a good chunk of that test -- left post-check-only there.
  const hintFuriganas = useMemo(() => {
    if (testType !== "hiragana" || !build || !build.choonpuHints.some(Boolean))
      return sentence.particle_furiganas;
    const base =
      sentence.particle_furiganas ??
      new Array(build.choonpuHints.length).fill(null);
    return base.map((v, i) => v ?? build.choonpuHints[i]);
  }, [testType, build, sentence.particle_furiganas]);

  // Before answering: only the hint furiganas above. Once answered (right or wrong), swap in the
  // full mora-by-mora romaji reading so the user can see how every grouping was actually read --
  // not shown earlier since it would give the answer away.
  const furiganas = useMemo(
    () =>
      result && build
        ? build.furiganas
        : hintFuriganas
          ? hintFuriganas.map((r) => r ?? "")
          : null,
    [result, build, hintFuriganas],
  );

  return (
    <div className="flex flex-col items-center gap-4 my-auto w-full">
      <p
        className={`w-fit text-[1.3rem] leading-relaxed text-white ${result ? "" : "select-none no-touch-callout"}`}
        onCopy={result ? undefined : (e) => e.preventDefault()}
        onContextMenu={result ? undefined : (e) => e.preventDefault()}
      >
        {renderReadingTestSentence(
          sentence.question,
          furiganas,
          hintFuriganas,
        )}
      </p>
      {result && sentence.english && (
        <p className="w-fit text-[0.9rem] italic text-text-muted">
          {sentence.english}
        </p>
      )}
      {!result && <div ref={onAnswerSlotReady} className="w-full" />}
      {result && (
        <>
          {result.correct ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-accent-green/20 bg-accent-green/[0.05] px-4 py-3">
              <FaCheck className="shrink-0 text-accent-green" />
              <span className="text-[0.95rem] text-white">
                {sentence.romaji}
              </span>
            </div>
          ) : (
            <TokenDiffList
              tokens={[
                {
                  raw: "",
                  correct: false,
                  userDiff: result.userDiff,
                  targetDiff: result.targetDiff,
                },
              ]}
              className="w-full"
            />
          )}
        </>
      )}
    </div>
  );
}
