"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { KanjiInfo } from "@/lib/types";
import { fetchKanjiInfoByCharacters } from "@/lib/data/kanji";
import { isKanjiChar } from "@/lib/study/furigana";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { KanjiInfoModal } from "./KanjiInfoModal";
import { useKanjiLongPress } from "./useKanjiLongPress";

/** Long-press-to-see-meaning for the kanji of the word(s) a /study card shows -- the "New kanji"
 * card's word list and the "Word reading" card's word. Pressable: every kanji in `text` the kanji
 * table knows, except `excludedKanji` (the one the card itself is about) and any whose meaning the
 * user has already learned. Nothing is pressable until the lookup lands, and it stays that way if
 * the lookup fails -- the card then works exactly as it would without this.
 *
 * Returns `renderKanji` (pass as renderWordWithFurigana/renderTargetWord's `renderText`), which
 * wraps each pressable kanji in the `data-kanji` span useKanjiLongPress looks for;
 * `longPressProps`, to spread on an element containing those words; `kanjiModal`, to render
 * anywhere in the card; and `kanjiModalOpen`, so the card can hold off its own keyboard shortcuts
 * while the modal covers it. */
export function usePressableKanji(text: string, excludedKanji: string | null) {
  const { user } = useStudyOnboarding();
  const [pressableKanji, setPressableKanji] = useState<Map<string, KanjiInfo>>(new Map());
  const [inspectedKanji, setInspectedKanji] = useState<KanjiInfo | null>(null);
  const longPressProps = useKanjiLongPress((char) => setInspectedKanji(pressableKanji.get(char) ?? null));

  // Keyed by the chars themselves, so the New kanji card's words -- which can arrive after it's
  // already on screen (see fetchStudyQueue's onKanjiWordsReady) -- re-run it once they land.
  // Fetched fresh per card rather than cached: "already learned" changes as the user studies.
  const kanjiKey = [...new Set(Array.from(text))].filter((char) => isKanjiChar(char) && char !== excludedKanji).join("");
  useEffect(() => {
    if (!kanjiKey) return;
    let cancelled = false;
    fetchKanjiInfoByCharacters(user.id, Array.from(kanjiKey))
      .then((rows) => {
        if (cancelled) return;
        setPressableKanji(new Map(rows.filter((row) => !row.meaning_learned).map((row) => [row.kanji, row])));
      })
      .catch(() => {
        // Nothing becomes pressable -- see above.
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, kanjiKey]);

  // select-none + no-touch-callout: holding the kanji would otherwise start a text selection /
  // the iOS callout menu instead of the long-press.
  function renderKanji(segment: string): ReactNode {
    return Array.from(segment).map((char, i) =>
      pressableKanji.has(char) ? (
        <span
          key={i}
          data-kanji={char}
          className="no-touch-callout select-none transition-colors hover:text-accent-gold active:text-accent-gold"
        >
          {char}
        </span>
      ) : (
        char
      )
    );
  }

  const kanjiModal = inspectedKanji && <KanjiInfoModal info={inspectedKanji} onClose={() => setInspectedKanji(null)} />;

  return { renderKanji, longPressProps, kanjiModal, kanjiModalOpen: inspectedKanji !== null };
}
