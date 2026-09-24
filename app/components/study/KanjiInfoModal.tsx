"use client";

import { createPortal } from "react-dom";
import { Modal } from "@/app/components/ui/Modal";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { OtherMeaningsToggle } from "@/app/components/browse/OtherMeaningsToggle";
import type { KanjiInfo } from "@/lib/types";

interface Props {
  info: KanjiInfo;
  onClose: () => void;
}

/** Quick look at one kanji (meaning + JLPT level), opened by long-pressing or double-tapping it on
 * a /study card -- see usePressableKanji, which only makes a kanji pressable once it already holds
 * its row, so there's nothing to load here. Only the first meaning shows up front; the rest (if
 * any) sit behind a "Show other meanings" toggle, one per row with the toggle's own hairline
 * dividers between them. */
export function KanjiInfoModal({ info, onClose }: Props) {
  const [firstMeaning, ...otherMeanings] = info.meanings ?? [];

  // Portaled because the word list this opens from sits inside StudyCardShell, whose backdrop-blur
  // makes it the containing block for any position:fixed descendant -- rendered in place, the
  // Modal's backdrop would only cover the card instead of the whole screen.
  //
  // select-none + no-touch-callout: this opens while the press that opened it is still held, so
  // holding on a bit longer reaches the OS's own long-press, which then lands on this dialog instead
  // of the pressed kanji -- and would select whatever text is under the finger. useKanjiLongPress
  // can't cancel that here: on Android the contextmenu event goes to this portal, outside the
  // element its props are spread on, and iOS doesn't fire one at all.
  return createPortal(
    <Modal onClose={onClose} labelledBy="kanji-info-title" showCloseButton>
      <div className="no-touch-callout select-none text-center">
        {/* Top-right, just left of the Modal's close button (top-4 right-4, h-9): top-5 centers
            the md badge's 28px on that 36px button, right-15 leaves a small gap before it. */}
        {info.level && <LevelBadge level={info.level} className="absolute right-15 top-5" />}
        <div id="kanji-info-title" className="mt-2 text-7xl leading-none text-white">
          {info.kanji}
        </div>
        {firstMeaning && <div className="mt-5 text-[1.3rem] font-bold text-white">{firstMeaning}</div>}
        <OtherMeaningsToggle
          otherMeanings={otherMeanings.length > 0 ? otherMeanings.map((meaning) => [meaning]) : null}
          centered
          className="mt-2"
        />
      </div>
    </Modal>,
    document.body
  );
}
