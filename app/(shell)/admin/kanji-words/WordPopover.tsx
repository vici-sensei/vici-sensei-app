"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { WordMeanings, type WordMeaningsValue } from "./WordMeanings";

export interface WordPopoverContent {
  word: string;
  jlpt: string | null;
  common: boolean;
  /** "loading" / "error": the kanji list's meanings haven't arrived (yet). */
  meanings: WordMeaningsValue | "loading" | "error";
}

// A mouse resting this long on a chip opens its popover; moving on to the next chip while one is open is instant.
const HOVER_DELAY_MS = 200;
// A finger held this long on a chip opens it (a shorter tap stays a tap: in the kanji list it opens the kanji).
const LONG_PRESS_MS = 450;
// Drifting further than this (px) during a press means the list is being scrolled.
const MOVE_TOLERANCE_PX = 10;
const GAP_PX = 6;
const EDGE_PX = 8;

function chipOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-word-id]") : null;
}

function Popover({ anchor, content }: { anchor: DOMRect; content: WordPopoverContent }) {
  const ref = useRef<HTMLDivElement>(null);

  // Below the chip, or above it when the bottom of the screen is too close; kept inside the screen sideways.
  // Written straight to the element before paint, so it never shows in the wrong place first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const below = anchor.bottom + GAP_PX;
    const top = below + height > window.innerHeight - EDGE_PX ? Math.max(EDGE_PX, anchor.top - GAP_PX - height) : below;
    const left = Math.min(Math.max(EDGE_PX, anchor.left), window.innerWidth - EDGE_PX - width);
    el.style.top = `${top}px`;
    el.style.left = `${Math.max(EDGE_PX, left)}px`;
  });

  const { meanings } = content;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ top: anchor.bottom + GAP_PX, left: anchor.left }}
      className="pointer-events-none fixed z-[200] w-max max-w-[min(24rem,calc(100vw-16px))] rounded-xl border border-border-soft bg-gray-900/95 p-3 text-left shadow-xl backdrop-blur-[10px]"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[1.1rem] font-bold">{content.word}</span>
        <span className="text-xs text-text-muted">
          {content.jlpt ?? "No JLPT level"}
          {content.common ? "" : " · not common"}
        </span>
      </div>
      {meanings === "loading" ? <p className="mt-1 text-sm italic text-text-muted">Loading the meanings…</p> : null}
      {meanings === "error" ? <p className="mt-1 text-sm italic text-text-muted">The meanings couldn&apos;t be loaded.</p> : null}
      {typeof meanings === "object" ? <WordMeanings {...meanings} className="mt-1" /> : null}
    </div>,
    document.body
  );
}

/**
 * The meanings popover of the word chips inside one container: spread `handlers` on the container, give each chip
 * `data-word-id`, and render `popover`. `resolve` turns a chip's id into what the popover shows.
 *
 * A mouse or pen opens it by resting on a chip and closes it by leaving; a finger opens it with a long press,
 * and the click that press would end with is swallowed, so a chip inside a button (the kanji list) doesn't also
 * press the button. Any press, a scroll or Escape closes it.
 */
export function useWordPopover(resolve: (id: number) => WordPopoverContent | null) {
  const [open, setOpen] = useState<{ id: number; anchor: DOMRect } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  // A long press just opened the popover: its touchend / click must not reach the chip's button.
  const firedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setOpen(null);
  }, [clearTimer]);

  function show(chip: HTMLElement) {
    setOpen({ id: Number(chip.dataset.wordId), anchor: chip.getBoundingClientRect() });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Any press, even on a chip: a click picks the kanji, a new long press opens its own popover.
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  useEffect(() => clearTimer, [clearTimer]);

  const handlers = {
    onPointerOver(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const chip = chipOf(e.target);
      if (!chip || chip.contains(e.relatedTarget as Node | null)) return;
      clearTimer();
      if (open) show(chip);
      else timerRef.current = setTimeout(() => show(chip), HOVER_DELAY_MS);
    },
    onPointerOut(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const chip = chipOf(e.target);
      if (!chip || chip.contains(e.relatedTarget as Node | null)) return;
      // Straight onto the next chip: onPointerOver takes over without closing in between.
      if (chipOf(e.relatedTarget)) return;
      close();
    },
    onPointerDown(e: PointerEvent) {
      firedRef.current = false;
      clearTimer();
      pressRef.current = null;
      if (e.pointerType !== "touch" || !e.isPrimary) return;
      const chip = chipOf(e.target);
      if (!chip) return;
      pressRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        show(chip);
      }, LONG_PRESS_MS);
    },
    onPointerMove(e: PointerEvent) {
      const press = pressRef.current;
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE_PX) {
        pressRef.current = null;
        clearTimer();
      }
    },
    onPointerUp(e: PointerEvent) {
      if (e.pointerType !== "touch") return;
      pressRef.current = null;
      if (!firedRef.current) clearTimer();
    },
    onPointerCancel() {
      pressRef.current = null;
      if (!firedRef.current) clearTimer();
    },
    onTouchEnd(e: TouchEvent) {
      if (firedRef.current) e.preventDefault();
    },
    onClickCapture(e: MouseEvent) {
      if (!firedRef.current) return;
      firedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onContextMenu(e: MouseEvent) {
      if (firedRef.current || pressRef.current) e.preventDefault();
    },
  };

  const content = open ? resolve(open.id) : null;
  const popover = open && content ? <Popover anchor={open.anchor} content={content} /> : null;
  return { handlers, popover };
}

/** Classes for a chip that opens the popover: no text selection or iOS callout on a long press. */
export const WORD_CHIP_CLASSES = "select-none [-webkit-touch-callout:none]";
