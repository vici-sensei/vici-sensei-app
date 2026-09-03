"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FaCheck } from "react-icons/fa6";
import { checkKanaReadingAnswer } from "@/lib/study/kanaReadingMatch";
import type { ReadingCheckResult } from "@/lib/study/kanjiReadingMatch";
import { ACCENT_FOCUS_BORDER_CLASSES } from "@/lib/study/accent";
import { buildFullRomajiFuriganas, renderReadingTestSentence } from "@/lib/study/readingTestFurigana";
import { TokenDiffList } from "@/app/components/study/TokenDiffList";
import { clearDraft, readDraft, writeDraft } from "@/lib/study/readingTestDraft";
import type { ReadingTestAnswer } from "@/lib/data/readingTest";
import type { ReadingTestSentence } from "@/lib/types";

interface Props {
  sentence: ReadingTestSentence;
  kanaRomajiMap: Map<string, string> | null;
  userId: string;
  testType: string;
  /** This user's saved attempt for this sentence, if any -- null means still pending (never
   * attempted, or reopened by "Retry the ones I got wrong" on the summary page). Renders the
   * locked state (green check or frozen diff) immediately, with no input/interaction, whether
   * that attempt was right or wrong. */
  persisted: ReadingTestAnswer | null;
  /** Fired once, the moment THIS visit's Check produces a result -- the caller persists it (see
   * user_reading_test_progress) regardless of outcome. */
  onCheck: (sentenceId: number, correct: boolean, userAnswer: string) => void;
}

/** One row of the reading test: the fixed hiragana sentence, a romaji input, and an explicit
 * Check button. One attempt per sentence -- both outcomes are persisted, so once answered
 * (right or wrong) it stays locked across a refresh/reopen too; only the summary page's "Retry
 * the ones I got wrong" reopens a wrong one. The in-progress draft (typed but not yet Checked) is
 * mirrored to localStorage so it survives a refresh while still pending. */
export function ReadingTestSentenceRow({ sentence, kanaRomajiMap, userId, testType, persisted, onCheck }: Props) {
  const [answer, setAnswer] = useState(() => (persisted ? "" : readDraft(userId, testType, sentence.id)));
  const [result, setResult] = useState<ReadingCheckResult | null>(() =>
    persisted
      ? persisted.correct
        ? { correct: true, userDiff: [], targetDiff: [] }
        : checkKanaReadingAnswer(persisted.userAnswer, sentence.romaji)
      : null
  );

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
  };

  // Before answering: only the particle-reading hints (は/を/へ), same as always. Once answered
  // (right or wrong), swap in the full mora-by-mora romaji reading so the user can see how every
  // grouping of hiragana was actually read -- not shown earlier since it would give the answer away.
  const furiganas = useMemo(
    () =>
      result && kanaRomajiMap
        ? buildFullRomajiFuriganas(sentence.question, kanaRomajiMap, sentence.particle_furiganas)
        : sentence.particle_furiganas
          ? sentence.particle_furiganas.map((r) => r ?? "")
          : null,
    [result, kanaRomajiMap, sentence.question, sentence.particle_furiganas]
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[1.3rem] leading-relaxed text-white">
        {renderReadingTestSentence(sentence.question, furiganas, sentence.particle_furiganas)}
      </p>
      {result && <p className="text-[0.9rem] italic text-text-muted">{sentence.english}</p>}
      {!result && (
        <form onSubmit={handleCheck} className="flex gap-2">
          <input
            type="text"
            value={answer}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Type the reading…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={`flex-1 select-none rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[0.95rem] text-white outline-none transition-colors ${ACCENT_FOCUS_BORDER_CLASSES.violet}`}
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
        <div className="">
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
        </div>
      )}
    </div>
  );
}
