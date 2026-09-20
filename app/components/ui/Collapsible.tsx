"use client";

import { useEffect, useState, type ReactNode } from "react";

// Keep in step with `duration-300` below -- the timers that hand overflow/mounting over once a
// transition has finished are keyed to it.
const DURATION_MS = 300;

/** Expands and contracts a block of content in place: its height animates between 0 and the
 * content's own natural height (the `grid-template-rows: 0fr <-> 1fr` trick, so no measuring in
 * JS), fading and moving its top margin along with it. Same technique the settings form already
 * uses for its amber hints and the "Also study lower levels" row.
 *
 * - The wrapper stays mounted while closed so the closing animation has something to play on;
 *   `unmountWhenClosed` drops the children themselves once it has finished, for content that runs
 *   work while mounted (e.g. an endlessly spinning die).
 * - Closed content is `inert`, so keyboard focus and screen readers skip it.
 * - Clipping is only needed while the height animates, and would also cut off anything that pops
 *   out of the content (a dropdown panel, a focus ring) -- so it's lifted once fully open. */
export function Collapsible({
  open,
  openClassName = "",
  unmountWhenClosed = false,
  children,
}: {
  open: boolean;
  /** Extra classes applied while open, e.g. a top margin that then animates to 0 on close. Written as
   * a complete literal by the caller (e.g. "mt-5") so Tailwind's scanner sees it. */
  openClassName?: string;
  unmountWhenClosed?: boolean;
  children: ReactNode;
}) {
  // Both start in the state a first render already at rest in `open` should be in -- no animation
  // on mount, only on later changes.
  const [settled, setSettled] = useState(open);
  const [present, setPresent] = useState(open);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setPresent(true);
    else setSettled(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) setSettled(true);
      else setPresent(false);
    }, DURATION_MS + 20);
    return () => clearTimeout(timer);
  }, [open]);

  const overflow = open && settled ? "overflow-visible" : "overflow-hidden";

  return (
    <div
      inert={!open}
      className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${overflow} ${
        open ? `${openClassName} grid-rows-[1fr] opacity-100` : "mt-0 grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className={`min-h-0 ${overflow}`}>{unmountWhenClosed && !present ? null : children}</div>
    </div>
  );
}
