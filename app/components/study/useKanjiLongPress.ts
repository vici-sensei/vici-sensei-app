"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type TouchEvent } from "react";

const LONG_PRESS_MS = 450;
// Max gap (ms) between a tap's release and the next press on the same kanji for the two to count
// as a double-tap -- Android's own double-tap timeout.
const DOUBLE_TAP_MS = 300;
// Drifting further than this (px) while held means the user is scrolling the list, not holding a
// kanji. A real scroll usually also fires pointercancel on its own -- this covers a slow drag.
const MOVE_TOLERANCE_PX = 10;

/** Delegated long-press / double-tap detection for every `[data-kanji]` element inside whatever
 * the returned props are spread on -- one set of listeners for a whole word list instead of one per
 * character. Fires `onPress` while the pointer is still held (a long-press's usual feel, and the
 * second tap's press of a double-tap), then swallows the rest of that same press: the native
 * context menu, and the touchend's compatibility mouse events -- a release just short of the OS's
 * own long-press threshold still counts as a tap to the browser, whose synthetic mousedown would
 * land on the just-opened Modal's backdrop and close it again straight away.
 *
 * A plain tap on a kanji has its touchend swallowed too: its synthetic mousedown would otherwise
 * blur the review cards' focused answer field, and the on-screen keyboard closing reflows the card
 * out from under the second tap of a double-tap. */
export function useKanjiLongPress(onPress: (kanji: string) => void) {
  const timerRef = useRef<number | null>(null);
  const pressRef = useRef<{ kanji: string; x: number; y: number } | null>(null);
  // Set by a press that ended as a tap on a kanji, cleared by the next press -- so while it's set,
  // it also means "the touchend now arriving belongs to a tap".
  const lastTapRef = useRef<{ kanji: string; time: number } | null>(null);
  const firedRef = useRef(false);
  const onPressRef = useRef(onPress);
  useEffect(() => {
    onPressRef.current = onPress;
  }, [onPress]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    pressRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  function fire(kanji: string) {
    firedRef.current = true;
    onPressRef.current(kanji);
  }

  function onPointerDown(event: PointerEvent) {
    // Reset on every press, even ones ignored below (a right-click, a tap between kanji), so a
    // previous press never leaks into onContextMenu/onTouchEnd -- or a double-tap -- for an
    // unrelated press.
    const lastTap = lastTapRef.current;
    lastTapRef.current = null;
    firedRef.current = false;
    cancel();
    if (!event.isPrimary || event.button !== 0) return;
    const kanji = (event.target as Element).closest<HTMLElement>("[data-kanji]")?.dataset.kanji;
    if (!kanji) return;
    if (lastTap?.kanji === kanji && event.timeStamp - lastTap.time <= DOUBLE_TAP_MS) {
      fire(kanji);
      return;
    }
    pressRef.current = { kanji, x: event.clientX, y: event.clientY };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      fire(kanji);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: PointerEvent) {
    const press = pressRef.current;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
  }

  function onPointerUp(event: PointerEvent) {
    // Still pending here = released before the long-press fired, without drifting: a tap.
    const press = pressRef.current;
    if (press && timerRef.current !== null) lastTapRef.current = { kanji: press.kanji, time: event.timeStamp };
    cancel();
  }

  function onTouchEnd(event: TouchEvent) {
    if (firedRef.current || lastTapRef.current) event.preventDefault();
  }

  function onContextMenu(event: MouseEvent) {
    if (firedRef.current || timerRef.current !== null) event.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onTouchEnd,
    onContextMenu,
  };
}
