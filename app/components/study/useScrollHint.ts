import { useEffect, useRef, useState } from "react";

// Gentle one-time "peek" scroll to hint a bounded box is scrollable.
const NUDGE_DISTANCE = 14;
const NUDGE_DURATION = 380;
const NUDGE_DELAY = 450;
const ARROW_SCROLL_DISTANCE = 60;

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateScrollTop(
  el: HTMLElement,
  to: number,
  duration: number,
  isCancelled: () => boolean,
  onDone?: () => void,
) {
  const from = el.scrollTop;
  const start = performance.now();

  function step(now: number) {
    if (isCancelled()) return;
    const t = Math.min(1, (now - start) / duration);
    el.scrollTop = from + (to - from) * easeInOutQuad(t);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  }

  requestAnimationFrame(step);
}

/**
 * Shared scroll-affordance for a card's bounded, possibly-overflowing box (a new-kanji word
 * list, a new-rule's notes text or example grid): tracks whether the box actually overflows and
 * whether the student has scrolled it to the bottom (so a caller can gate "Next" on it), shows a
 * bottom fade while there's more to see, nudges the scroll position once to hint it's
 * scrollable, and lets ArrowUp/ArrowDown scroll it while it overflows.
 */
export function useScrollHint<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [showFade, setShowFade] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);

  useEffect(() => {
    if (!isScrollable) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const el = ref.current;
      if (!el) return;
      event.preventDefault();
      el.scrollBy({ top: event.key === "ArrowDown" ? ARROW_SCROLL_DISTANCE : -ARROW_SCROLL_DISTANCE, behavior: "smooth" });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isScrollable]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const updateFade = () => {
      const scrollable = el.scrollHeight - el.clientHeight > 1;
      const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= 1;
      setShowFade(scrollable && !atBottom);
      setIsScrollable(scrollable);
      if (atBottom) setHasScrolledToBottom(true);
    };

    const observer = new ResizeObserver(updateFade);
    observer.observe(el);
    el.addEventListener("scroll", updateFade);
    updateFade();

    let cancelled = false;
    let userScrolled = false;
    const markUserScrolled = () => {
      userScrolled = true;
    };
    el.addEventListener("wheel", markUserScrolled, { passive: true });
    el.addEventListener("touchstart", markUserScrolled, { passive: true });

    const nudgeTimeout = window.setTimeout(() => {
      if (cancelled || userScrolled || el.scrollHeight - el.clientHeight <= 1) return;
      animateScrollTop(
        el,
        NUDGE_DISTANCE,
        NUDGE_DURATION,
        () => cancelled || userScrolled,
        () => {
          if (cancelled || userScrolled) return;
          animateScrollTop(el, 0, NUDGE_DURATION, () => cancelled);
        },
      );
    }, NUDGE_DELAY);

    return () => {
      cancelled = true;
      observer.disconnect();
      el.removeEventListener("scroll", updateFade);
      el.removeEventListener("wheel", markUserScrolled);
      el.removeEventListener("touchstart", markUserScrolled);
      window.clearTimeout(nudgeTimeout);
    };
  }, []);

  return { ref, showFade, isScrollable, hasScrolledToBottom };
}
