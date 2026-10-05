"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { KanjiInfo } from "@/lib/types";
import { fetchKanjiInfoByCharacters } from "@/lib/data/kanji";
import { isKanjiChar } from "@/lib/study/furigana";
import { hasSeenKanjiHint, markKanjiHintSeen, type KanjiHintContext } from "@/lib/study/kanjiHintStorage";
import { useAuth } from "@/lib/auth/AuthProvider";
import { KanjiInfoModal } from "./KanjiInfoModal";
import { useKanjiLongPress } from "./useKanjiLongPress";

/** Long-press-or-double-tap-to-see-meaning for the kanji of the word(s) a page shows -- the /study
 * cards ("New kanji"'s word list, "Word reading", "New word", "Vocabulary") and the dictionary's
 * word lists (`context` "dictionary"; the modal then also links to the kanji's own page).
 * Pressable: every kanji in `text` the kanji table knows, except `excludedKanji` (the one the page
 * itself is about, or the one a card would give away) -- whether the student has already learned
 * its meaning doesn't matter. Pass `null` for `excludedKanji` once nothing needs hiding (e.g. a
 * review card's answer is revealed). Nothing is pressable until the lookup lands, and it stays that
 * way if the lookup fails -- the page then works exactly as it would without this.
 *
 * Returns `renderKanji` (pass as renderWordWithFurigana/renderTargetWord's `renderText`), which
 * wraps each pressable kanji in the `data-kanji` span useKanjiLongPress looks for;
 * `longPressProps`, to spread on an element containing those words; `kanjiModal`, to render
 * anywhere on the page; `kanjiModalOpen`, so a card can hold off its own keyboard shortcuts
 * while the modal covers it; and `showKanjiHint`, whether to show the one-time KanjiHint line
 * (there's something to press and none was opened yet in this `context`). */
export function usePressableKanji(text: string, excludedKanji: string | null, context: KanjiHintContext = "study") {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [kanjiInfo, setKanjiInfo] = useState<Map<string, KanjiInfo>>(new Map());
  const [inspectedKanji, setInspectedKanji] = useState<KanjiInfo | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const longPressProps = useKanjiLongPress((char) => {
    const info = kanjiInfo.get(char) ?? null;
    setInspectedKanji(info);
    if (info && userId) markKanjiHintSeen(userId, context);
    if (info) setHintDismissed(true);
  });

  // Keyed by the chars themselves, so the New kanji card's words -- which can arrive after it's
  // already on screen (see fetchStudyQueue's onKanjiWordsReady) -- re-run it once they land.
  // `excludedKanji` is looked up too: it's only left out when rendering, so it's already here
  // the moment it stops being excluded. fetchKanjiInfoByCharacters caches, so a repeat is free.
  const kanjiKey = [...new Set(Array.from(text))].filter(isKanjiChar).join("");
  useEffect(() => {
    if (!kanjiKey) return;
    let cancelled = false;
    fetchKanjiInfoByCharacters(Array.from(kanjiKey))
      .then((rows) => {
        if (cancelled) return;
        setKanjiInfo((prev) => new Map([...prev, ...rows.map((row): [string, KanjiInfo] => [row.kanji, row])]));
      })
      .catch(() => {
        // Nothing becomes pressable -- see above.
      });
    return () => {
      cancelled = true;
    };
  }, [kanjiKey]);

  const isPressable = (char: string) => char !== excludedKanji && kanjiInfo.has(char);

  // Read from storage only once there's something to press (that lookup is async, so never during
  // the server render/hydration pass -- no mismatch to worry about).
  const hasPressable = Array.from(kanjiKey).some(isPressable);
  const hintAlreadySeen = useMemo(
    () => !hasPressable || !userId || hasSeenKanjiHint(userId, context),
    [hasPressable, userId, context]
  );

  // select-none + no-touch-callout: holding the kanji would otherwise start a text selection /
  // the iOS callout menu instead of the long-press (and double-tapping it would select it).
  function renderKanji(segment: string): ReactNode {
    return Array.from(segment).map((char, i) =>
      isPressable(char) ? (
        <span
          key={i}
          data-kanji={char}
          className="no-touch-callout select-none transition-colors duration-300 ease-out hover:text-accent-gold active:text-accent-gold"
        >
          {char}
        </span>
      ) : (
        char
      )
    );
  }

  const kanjiModal = inspectedKanji && (
    <KanjiInfoModal
      info={inspectedKanji}
      onClose={() => setInspectedKanji(null)}
      kanjiPageHref={context === "dictionary" ? `/browse/kanji/detail?id=${inspectedKanji.id}` : undefined}
    />
  );

  return {
    renderKanji,
    longPressProps,
    kanjiModal,
    kanjiModalOpen: inspectedKanji !== null,
    showKanjiHint: !hintAlreadySeen && !hintDismissed,
  };
}
