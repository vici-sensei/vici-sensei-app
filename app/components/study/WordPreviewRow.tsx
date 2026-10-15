import type { ReactNode } from "react";
import { FaLock } from "react-icons/fa6";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { UsuallyKanaNote } from "@/app/components/ui/UsuallyKanaNote";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import type { NewKanjiIntroWord } from "@/lib/types";

interface Props {
  vocabulary: NewKanjiIntroWord["vocabulary"];
  /** Makes the word's kanji pressable -- NewKanjiIntroCard's usePressableKanji().renderKanji. */
  renderKanji: (text: string) => ReactNode;
  /** Set when the word is locked for this student (see get_kanji_word_locks): grayed out, with a
   * padlock and the level that unlocks its Word reading card. */
  unlockLevel?: string | null;
}

// Grayed out, not hidden: the word and its meaning stay readable (and its kanji pressable). The
// darker row background sets the locked words apart as one inactive block, at a glance.
const LOCKED_FADE = "opacity-45 grayscale";
const LOCKED_ROW_BG = "bg-black/15";

/** One row of the word list shown on a new-kanji intro card. */
export function WordPreviewRow({ vocabulary, renderKanji, unlockLevel }: Props) {
  const fade = unlockLevel ? LOCKED_FADE : "";
  return (
    <div className={`px-3 py-2.5 ${unlockLevel ? LOCKED_ROW_BG : ""}`}>
      {/* On its own line above the word, so the lock reads before the word itself. */}
      {unlockLevel && (
        <div className="mb-0.5 flex items-center justify-center gap-1.5 text-[0.75rem] font-semibold text-text-muted md:justify-start">
          <FaLock aria-hidden className="h-3.5 w-3.5 shrink-0" />
          Unlocks at {unlockLevel}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className={`shrink-0 pt-[0.4em] text-3xl leading-none ${fade}`}>
          {renderWordWithFurigana(vocabulary.word, vocabulary.furiganas, undefined, undefined, undefined, renderKanji)}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`leading-[1.4] text-text-muted ${fade}`}>{vocabulary.primary_meanings?.join(", ")}</div>
          {vocabulary.usually_kana && (
            <div className={`mt-1.5 ${fade}`}>
              <UsuallyKanaNote />
            </div>
          )}
        </div>
        {vocabulary.jlpt_level && (
          <LevelBadge level={vocabulary.jlpt_level} size="sm" className={`shrink-0 ${fade}`} />
        )}
      </div>
    </div>
  );
}
