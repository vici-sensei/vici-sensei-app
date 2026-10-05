"use client";

import { useCallback, useRef, useEffect, type MouseEvent, type PointerEvent, type TouchEvent } from "react";

// Max gap (ms) between a tap's release and the next press on the same kanji for the two to count
// as a double-tap -- Android's own double-tap timeout.
const DOUBLE_TAP_MS = 300;
// A finger held down longer than this isn't tapping, it's holding (the OS's own press-and-hold),
// so its release doesn't count as the first tap of a double-tap.
const MAX_TAP_MS = 450;
// Drifting further than this (px) between press and release means the user is scrolling the list,
// not tapping a kanji. A real scroll usually also fires pointercancel on its own -- this covers a
// slow drag.
const MOVE_TOLERANCE_PX = 10;

/** Delegated press detection for every `[data-kanji]` element inside whatever the returned props
 * are spread on -- one set of listeners for a whole word list instead of one per character.
 *
 * What counts as a press depends on the pointer, decided per event (so a touchscreen laptop works
 * either way): a mouse or pen needs a single click; a finger needs a double-tap, and nothing else
 * -- no long-press, so holding a kanji does nothing.
 *
 * A double-tap fires on the second tap's press, while the finger is still down, then swallows the
 * rest of that press: the native context menu, and the touchend's compatibility mouse events -- the
 * synthetic mousedown would otherwise land on the just-opened Modal's backdrop and close it again
 * straight away.
 *
 * A plain tap on a kanji has its touchend swallowed too: its synthetic mousedown would otherwise
 * blur the review cards' focused answer field, and the on-screen keyboard closing reflows the card
 * out from under the second tap of a double-tap. */
export function useKanjiPress(onPress: (kanji: string) => void) {
  const pressRef = useRef<{ kanji: string; x: number; y: number; time: number } | null>(null);
  // Set by a touch that ended as a tap on a kanji, cleared by the next press -- so while it's set,
  // it also means "the touchend now arriving belongs to a tap".
  const lastTapRef = useRef<{ kanji: string; time: number } | null>(null);
  const firedRef = useRef(false);
  // What the latest press was made with: the click that follows it carries no reliable pointerType
  // of its own on every browser.
  const pointerTypeRef = useRef("mouse");
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const cancel = useCallback(() => {
    pressRef.current = null;
  }, []);

  function fire(kanji: string) {
    firedRef.current = true;
    onPressRef.current(kanji);
  }

  function kanjiOf(target: EventTarget): string | undefined {
    return (target as Element).closest<HTMLElement>("[data-kanji]")?.dataset.kanji;
  }

  function onPointerDown(event: PointerEvent) {
    // Reset on every press, even ones ignored below (a right-click, a tap between kanji), so a
    // previous press never leaks into onContextMenu/onTouchEnd -- or a double-tap -- for an
    // unrelated press.
    const lastTap = lastTapRef.current;
    lastTapRef.current = null;
    firedRef.current = false;
    cancel();
    pointerTypeRef.current = event.pointerType;
    // A mouse or pen opens on its click -- see onClick.
    if (event.pointerType !== "touch" || !event.isPrimary || event.button !== 0) return;
    const kanji = kanjiOf(event.target);
    if (!kanji) return;
    if (lastTap?.kanji === kanji && event.timeStamp - lastTap.time <= DOUBLE_TAP_MS) {
      fire(kanji);
      return;
    }
    pressRef.current = { kanji, x: event.clientX, y: event.clientY, time: event.timeStamp };
  }

  function onPointerMove(event: PointerEvent) {
    const press = pressRef.current;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
  }

  function onPointerUp(event: PointerEvent) {
    // Still pending here = released quickly, without drifting: a tap.
    const press = pressRef.current;
    if (press && event.timeStamp - press.time <= MAX_TAP_MS) lastTapRef.current = { kanji: press.kanji, time: event.timeStamp };
    cancel();
  }

  function onClick(event: MouseEvent) {
    // A touch's own tap already ran through the double-tap logic above (and its synthetic click is
    // swallowed in onTouchEnd on top of this).
    if (pointerTypeRef.current === "touch" || event.button !== 0) return;
    // A click only reaches here as itself when press and release landed on the same element; one
    // that started on a kanji and ended elsewhere (a drag) bubbles up with that ancestor as target.
    const kanji = kanjiOf(event.target);
    if (kanji) fire(kanji);
  }

  function onTouchEnd(event: TouchEvent) {
    if (firedRef.current || lastTapRef.current) event.preventDefault();
  }

  function onContextMenu(event: MouseEvent) {
    if (firedRef.current) event.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onClick,
    onTouchEnd,
    onContextMenu,
  };
}
