"use client";

import { useLayoutEffect, useRef } from "react";

// The open card's gap under the sticky header, like the list's own (it sticks 1rem under it).
const HEADER_GAP_PX = 16;
// However short the window, the filters keep this much room to scroll in.
const MIN_SCROLL_PX = 120;

/**
 * Keeps the open card of a dock between the header and the window's bottom. The card grows upwards from its circle,
 * which rests in the list card's corner at the end of the list: when the list is short (a search with one kanji),
 * that corner is high on the screen and the card would grow past the window's top. It then comes down over the empty
 * page below, just as far as it has to, never lower than where the circle floats while the page scrolls. Its
 * scrolling part is capped so the whole card fits between the header and that spot.
 *
 * `dockRef` goes on the dock (absolutely placed in a zero-height sticky strip, its card as first child), `scrollRef`
 * on the card's scrolling part.
 */
export function useKeepCardInWindow(open: boolean) {
  const dockRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const scroller = scrollRef.current;
    const strip = dock?.parentElement;
    const card = dock?.firstElementChild;
    if (!open || !dock || !scroller || !strip || !(card instanceof HTMLElement)) return;
    // The circle's gap above the strip, read before it's moved.
    const dockGap = parseFloat(getComputedStyle(dock).bottom);
    const fitNow = () => {
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const top = Math.max(0, headerBottom) + HEADER_GAP_PX;
      // The card's bottom at its circle, and where the circle floats while the page scrolls (more over a phone's
      // home bar), which is also as low as the card goes.
      const atCircle = strip.getBoundingClientRect().top - dockGap;
      const lowest = window.innerHeight - parseFloat(getComputedStyle(strip).bottom) - dockGap;
      const rest = card.offsetHeight - scroller.offsetHeight;
      scroller.style.maxHeight = `${Math.max(MIN_SCROLL_PX, lowest - top - rest)}px`;
      const bottom = Math.min(lowest, Math.max(atCircle, top + card.offsetHeight));
      const lift = bottom - atCircle;
      dock.style.bottom = `${dockGap - lift}px`;
      // It still grows out of its circle when it opens.
      card.style.transformOrigin = lift > 0 ? `right ${card.offsetHeight - lift}px` : "";
    };
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitNow);
    };
    fitNow();
    // A filter that adds "Reset filters" or the admins' group changes the card's height.
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    window.addEventListener("scroll", fit, { passive: true });
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      dock.style.bottom = "";
      card.style.transformOrigin = "";
      scroller.style.maxHeight = "";
    };
  }, [open]);

  return { dockRef, scrollRef };
}
