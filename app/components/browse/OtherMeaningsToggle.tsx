"use client";

import { useState } from "react";
import { FaChevronDown } from "react-icons/fa6";

function Chevron({ open }: { open: boolean }) {
  return <FaChevronDown className={`shrink-0 text-[0.6rem] transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />;
}

/** Whether OtherMeaningsToggle renders anything for these other_meanings (its "Show other meanings"
 * button is visible) -- for callers that lay out neighbouring content differently when it is. */
export function hasOtherMeanings(otherMeanings: string[][] | null | undefined): otherMeanings is string[][] {
  return !!otherMeanings && otherMeanings.length > 0;
}

interface Props {
  /** public.vocabulary.other_meanings -- one array of glosses per JMdict sense not already
   * covered by primary_meanings (see 20261130_vocabulary_primary_other_meanings.sql). Renders
   * nothing when null/empty, which is most words. */
  otherMeanings: string[][] | null;
  className?: string;
}

/** "Show other meanings" toggle for a word's other_meanings, placed under its primary meanings on
 * /browse/vocabulary, /browse/vocabulary/detail, and /browse/kanji/detail's word list. Own local
 * state, so each row on a list page expands/collapses independently. stopPropagation +
 * preventDefault on click since /browse/vocabulary wraps each row in a Link to the detail page --
 * without them, clicking the toggle would also navigate away.
 *
 * Expand/collapse animates via a grid-template-rows 0fr/1fr transition -- same technique as
 * BadgesSection.tsx's Collapsible -- rather than max-height, since it doesn't need a guessed
 * content height. Content stays mounted at all times (never conditionally rendered), which is
 * what makes both directions animatable.
 *
 * The button only grows a touch-friendly hit area and background chip under `(pointer: coarse)`
 * (touchscreens, via Tailwind's pointer-coarse: variant) -- a mouse/trackpad pointer sees the
 * original plain text link, unchanged.
 */
export function OtherMeaningsToggle({ otherMeanings, className }: Props) {
  const [open, setOpen] = useState(false);
  if (!hasOtherMeanings(otherMeanings)) return null;

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1.5 text-[0.72rem] font-semibold text-text-muted/80 transition-colors hover:text-white pointer-coarse:-mx-3 pointer-coarse:rounded-lg pointer-coarse:bg-white/[0.04] pointer-coarse:px-3 pointer-coarse:py-2.5 pointer-coarse:ml-0 pointer-coarse:text-[0.8rem] pointer-coarse:active:bg-white/10 pointer-coarse:active:text-white"
      >
        <Chevron open={open} />
        {open ? "Hide other meanings" : "Show other meanings"}
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className={`min-h-0 overflow-hidden transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
          <div className="mt-1 flex flex-col divide-y divide-white/10 text-[0.8rem] text-text-muted">
            {otherMeanings.map((sense, i) => (
              <div key={i} className="py-1">
                {sense.join(", ")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
