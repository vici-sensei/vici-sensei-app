"use client";

import { renderTargetWord } from "@/lib/study/furigana";
import type { KanjiWordCandidate } from "@/lib/types";

interface StudentPreviewProps {
  kanji: string;
  /** The words that would be in the list, in the order the editor shows them. */
  words: KanjiWordCandidate[];
  /** How many "Word reading" cards the saved list produces now, for the comparison line. */
  currentCount: number;
}

/**
 * What a student gets when this kanji is introduced: one Kanji meaning card plus one "Word reading" card per
 * word. The word shows furigana everywhere except above the kanji being tested (renderTargetWord, the same
 * renderer the study card uses), because the card asks for exactly that reading.
 */
export function StudentPreview({ kanji, words, currentCount }: StudentPreviewProps) {
  const delta = words.length - currentCount;
  return (
    <section className="rounded-xl border border-border-soft bg-white/[0.02] p-4">
      <h3 className="text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">What a student gets</h3>
      <p className="mt-1 text-sm text-text-muted">
        1 Kanji meaning card and {words.length} Word reading card{words.length === 1 ? "" : "s"}
        {delta === 0 ? " (same as now)" : ` (${delta > 0 ? "+" : ""}${delta} compared with now)`}.
      </p>
      {words.length === 0 ? (
        <p className="mt-3 text-sm italic text-text-muted">No words: the kanji is only taught by its meaning.</p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {words.map((w) => (
            <li key={w.id} className="rounded-lg border border-border-soft bg-bg-main/60 px-3 py-2 text-center">
              <div className="text-[1.6rem] font-bold leading-[2]">
                {renderTargetWord(w.word, kanji, w.furiganas, null)}
              </div>
              <div className="text-xs text-text-muted">{w.meanings?.[0] ?? ""}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
