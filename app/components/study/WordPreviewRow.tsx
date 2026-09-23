import type { ReactNode } from "react";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { UsuallyKanaNote } from "@/app/components/ui/UsuallyKanaNote";
import { isKanjiChar, renderWordWithFurigana } from "@/lib/study/furigana";
import type { NewKanjiIntroWord } from "@/lib/types";

/** Wraps every kanji in its own `data-kanji` span -- what NewKanjiIntroCard's delegated
 * long-press handler (useKanjiLongPress) looks for to tell which one was held. */
function renderPressableKanji(text: string): ReactNode {
  return Array.from(text).map((char, i) =>
    isKanjiChar(char) ? (
      <span key={i} data-kanji={char} className="transition-colors hover:text-accent-gold active:text-accent-gold">
        {char}
      </span>
    ) : (
      char
    )
  );
}

/** One row of the word list shown on a new-kanji intro card. Its kanji are long-pressable (see
 * renderPressableKanji), so the word itself is select-none + no-touch-callout -- otherwise holding
 * one would start a text selection / the iOS callout menu instead. */
export function WordPreviewRow({ vocabulary }: { vocabulary: NewKanjiIntroWord["vocabulary"] }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="no-touch-callout shrink-0 select-none pt-[0.4em] text-3xl leading-none">
        {renderWordWithFurigana(vocabulary.word, vocabulary.furiganas, undefined, undefined, undefined, renderPressableKanji)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="leading-[1.4] text-text-muted">{vocabulary.primary_meanings?.join(", ")}</div>
        {vocabulary.usually_kana && (
          <div className="mt-1.5">
            <UsuallyKanaNote />
          </div>
        )}
      </div>
      {vocabulary.jlpt_level && <LevelBadge level={vocabulary.jlpt_level} size="sm" className="shrink-0" />}
    </div>
  );
}
