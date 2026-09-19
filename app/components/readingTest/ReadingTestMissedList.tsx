import { Fragment } from "react";
import type { ReadingTestAnswer } from "@/lib/data/readingTest";
import type { ReadingTestSentence } from "@/lib/types";

export interface ReadingTestMissedItem {
  sentence: ReadingTestSentence;
  answer: ReadingTestAnswer;
}

const HEADER_CLASS = "text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted";

/** The wrong answers on a reading-test score screen -- same Card / Correct / You wrote table the
 * /study/practice summary shows for its missed cards. Sized to its content, but scrolls
 * internally past ~45vh so a test with many misses doesn't push the Retry/Not now buttons
 * off-screen. No min-height on purpose: min-height always wins over max-height, which would turn
 * that internal scroll off. */
export function ReadingTestMissedList({ items }: { items: ReadingTestMissedItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-8.5 max-h-[45vh] overflow-y-auto rounded-2xl border border-border-soft bg-bg-cards p-4 text-left backdrop-blur-[10px]">
      <div className="mb-3 text-center text-[0.78rem] font-semibold uppercase tracking-[0.5px] text-text-muted">
        Missed ({items.length})
      </div>
      <div className="grid grid-cols-3 items-center gap-x-1 gap-y-2 text-[0.9rem]">
        <div className={HEADER_CLASS}>Card</div>
        <div className={HEADER_CLASS}>Correct</div>
        <div className={HEADER_CLASS}>You wrote</div>
        {items.map(({ sentence, answer }) => (
          <Fragment key={sentence.id}>
            <div className="break-words text-center font-bold text-white">{sentence.question}</div>
            <div className="break-words text-center text-accent-green">{sentence.romaji}</div>
            <div className="break-words text-center text-accent-red">{answer.userAnswer || "—"}</div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
