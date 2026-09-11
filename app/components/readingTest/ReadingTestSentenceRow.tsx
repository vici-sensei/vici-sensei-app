"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { FaCheck } from "react-icons/fa6";
import { checkKanaReadingAnswer } from "@/lib/study/kanaReadingMatch";
import type { ReadingCheckResult } from "@/lib/study/kanjiReadingMatch";
import { ACCENT_FOCUS_BORDER_CLASSES } from "@/lib/study/accent";
import { buildFullRomajiFuriganas, renderReadingTestSentence } from "@/lib/study/readingTestFurigana";
import { TokenDiffList } from "@/app/components/study/TokenDiffList";
import { clearDraft, readDraft, writeDraft } from "@/lib/study/readingTestDraft";
import type { ReadingTestSentence } from "@/lib/types";

interface Props {
  sentence: ReadingTestSentence;
  kanaRomajiMap: Map<string, string> | null;
  userId: string;
  testType: string;
  /** Fired once, the moment Check produces a result -- the caller persists it (see
   * user_reading_test_progress) regardless of outcome. */
  onCheck: (sentenceId: number, correct: boolean, userAnswer: string) => void;
  /** Fired when the student moves on -- either a click on the Next button that Check turns into,
   * or pressing Enter once a result is showing. */
  onNext: () => void;
}

/** One question of the reading test, shown one at a time by the test page: the fixed hiragana
 * sentence, a romaji input, and an explicit Check button that becomes a Next button once
 * answered. The caller always mounts a fresh instance per question (key={sentence.id}), which is
 * what makes autofocus below "just work" on every new question without extra wiring. The
 * in-progress draft (typed but not yet Checked) is mirrored to localStorage so it survives a
 * refresh while this question is still pending. */
export function ReadingTestSentenceRow({ sentence, kanaRomajiMap, userId, testType, onCheck, onNext }: Props) {
  const [answer, setAnswer] = useState(() => readDraft(userId, testType, sentence.id));
  const [result, setResult] = useState<ReadingCheckResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAnswerChange = (value: string) => {
    setAnswer(value);
    writeDraft(userId, testType, sentence.id, value);
  };

  const handleCheck = (event: FormEvent) => {
    event.preventDefault();
    if (!answer.trim() || result) return;
    const checked = checkKanaReadingAnswer(answer, sentence.romaji);
    setResult(checked);
    clearDraft(userId, testType, sentence.id);
    onCheck(sentence.id, checked.correct, answer);
    // Closes the on-screen keyboard on mobile -- pressing the keyboard's own Enter/Go key submits
    // the form but doesn't blur the input on its own, so the keyboard would otherwise stay open
    // covering the just-revealed result.
    inputRef.current?.blur();
  };

  // Lets Enter advance to the next question on desktop without requiring a click, even when focus
  // isn't on the Next button itself (the input that just blurred, for instance). Skipped when a
  // button already has focus -- that Enter press is already handled by the button's own native
  // activation, and letting both fire would call onNext twice.
  useEffect(() => {
    if (!result) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || document.activeElement instanceof HTMLButtonElement) return;
      onNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result, onNext]);

  // Anti-cheat, same as AnswerForm: block pasting an answer in, and block copying the question
  // out, while it's still unanswered. Once answered (`result` set), the question is unlocked for
  // copying like anywhere else in the app.
  const preventClipboardBypass = (event: ClipboardEvent<HTMLInputElement> | DragEvent<HTMLInputElement>) => {
    event.preventDefault();
  };

  const build = useMemo(
    () => (kanaRomajiMap ? buildFullRomajiFuriganas(sentence.question, kanaRomajiMap, sentence.particle_furiganas) : null),
    [kanaRomajiMap, sentence.question, sentence.particle_furiganas]
  );

  // Which positions get the always-shown/blue hint treatment: は/を/へ particle overrides, same as
  // always, plus -- hiragana test only -- build.choonpuHints. Chōonpu (ー) doesn't occur in
  // standard hiragana at all, so a hiragana word using it genuinely needs the reading spelled out,
  // same category as a particle exception. Katakana uses ー constantly, so hinting every
  // occurrence there would give away a good chunk of that test -- left post-check-only there.
  const hintFuriganas = useMemo(() => {
    if (testType !== "hiragana" || !build || !build.choonpuHints.some(Boolean)) return sentence.particle_furiganas;
    const base = sentence.particle_furiganas ?? new Array(build.choonpuHints.length).fill(null);
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
    [result, build, hintFuriganas]
  );

  return (
    <div className="flex flex-col gap-4">
      <p
        className={`text-[1.3rem] leading-relaxed text-white ${result ? "" : "select-none no-touch-callout"}`}
        onCopy={result ? undefined : (e) => e.preventDefault()}
        onContextMenu={result ? undefined : (e) => e.preventDefault()}
      >
        {renderReadingTestSentence(sentence.question, furiganas, hintFuriganas)}
      </p>
      {result && sentence.english && <p className="text-[0.9rem] italic text-text-muted">{sentence.english}</p>}
      {!result && (
        <form onSubmit={handleCheck} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={answer}
            onChange={(e) => handleAnswerChange(e.target.value)}
            onPaste={preventClipboardBypass}
            onCopy={preventClipboardBypass}
            onCut={preventClipboardBypass}
            onDrop={preventClipboardBypass}
            onContextMenu={(e) => e.preventDefault()}
            placeholder="Type the reading…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            className={`flex-1 select-none no-touch-callout rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[0.95rem] text-white outline-none transition-colors ${ACCENT_FOCUS_BORDER_CLASSES.violet}`}
          />
          <button
            type="submit"
            disabled={!answer.trim()}
            className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-bold text-white transition-colors enabled:hover:border-white/20 enabled:hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Check
          </button>
        </form>
      )}

      {result && (
        <>
          {result.correct ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-accent-green/20 bg-accent-green/[0.05] px-4 py-3">
              <FaCheck className="shrink-0 text-accent-green" />
              <span className="text-[0.95rem] text-white">{sentence.romaji}</span>
            </div>
          ) : (
            <TokenDiffList
              tokens={[{ raw: "", correct: false, userDiff: result.userDiff, targetDiff: result.targetDiff }]}
              className=""
            />
          )}
          <button
            type="button"
            onClick={onNext}
            autoFocus
            className="w-full cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-bold text-white transition-colors hover:border-white/20 hover:bg-white/[0.07]"
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
