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
 * any) sit behind a "Show other meanings" toggle, as one comma-separated line. */
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
        <div id="kanji-info-title" className="mt-2 text-7xl leading-none text-white">
          {info.kanji}
        </div>
        {firstMeaning && <div className="mt-5 text-[1.3rem] font-bold text-white">{firstMeaning}</div>}
        <OtherMeaningsToggle otherMeanings={otherMeanings.length > 0 ? [otherMeanings] : null} centered className="mt-2" />
        {info.level && (
          <div className="mt-4 flex justify-center">
            <LevelBadge level={info.level} />
          </div>
        )}
      </div>
    </Modal>,
    document.body
  );
}
