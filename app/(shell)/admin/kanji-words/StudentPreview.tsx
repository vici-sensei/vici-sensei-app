"use client";

import { renderTargetWord } from "@/lib/study/furigana";
import type { KanjiWordCandidate } from "@/lib/types";
import { candidateMeanings, WordMeanings } from "./WordMeanings";

interface StudentPreviewProps {
  kanji: string;
  /** The words that would be in the list, in the order the editor shows them. */
  words: KanjiWordCandidate[];
}

/**
 * What a student gets when this kanji is introduced: one Kanji meaning card plus one "Word reading" card per
 * word. The word shows furigana everywhere except above the kanji being tested (renderTargetWord, the same
 * renderer the study card uses), because the card asks for exactly that reading.
 */
export function StudentPreview({ kanji, words }: StudentPreviewProps) {
  return (
    <section className="rounded-xl border border-border-soft bg-white/[0.02] p-4">
      {words.length === 0 ? (
        <p className="text-sm italic text-text-muted">No words: the kanji is only taught by its meaning.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {words.map((w) => (
            <li key={w.id} className="rounded-lg border border-border-soft bg-bg-main/60 px-3 py-2 text-center">
              <div className="text-[1.6rem] font-bold leading-[2]">
                {renderTargetWord(w.word, kanji, w.furiganas, null)}
              </div>
              <WordMeanings {...candidateMeanings(w)} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
