"use client";

import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type TouchEvent } from "react";

const LONG_PRESS_MS = 450;
// Drifting further than this (px) while held means the user is scrolling the list, not holding a
// kanji. A real scroll usually also fires pointercancel on its own -- this covers a slow drag.
const MOVE_TOLERANCE_PX = 10;

/** Delegated long-press detection for every `[data-kanji]` element inside whatever the returned
 * props are spread on -- one set of listeners for a whole word list instead of one per character.
 * Fires `onLongPress` while the pointer is still held (the usual long-press feel), then swallows
 * the rest of that same press: the native context menu, and the touchend's compatibility mouse
 * events -- a release just short of the OS's own long-press threshold still counts as a tap to the
 * browser, whose synthetic mousedown would land on the just-opened Modal's backdrop and close it
 * again straight away. */
export function useKanjiLongPress(onLongPress: (kanji: string) => void) {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    originRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  function onPointerDown(event: PointerEvent) {
    // Reset on every press, even ones ignored below (a right-click, a tap between kanji), so a
    // previous long-press never leaks into onContextMenu/onTouchEnd for an unrelated press.
    firedRef.current = false;
    cancel();
    if (!event.isPrimary || event.button !== 0) return;
    const kanji = (event.target as Element).closest<HTMLElement>("[data-kanji]")?.dataset.kanji;
    if (!kanji) return;
    originRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      onLongPressRef.current(kanji);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(event: PointerEvent) {
    const origin = originRef.current;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_TOLERANCE_PX) cancel();
  }

  function onTouchEnd(event: TouchEvent) {
    if (firedRef.current) event.preventDefault();
  }

  function onContextMenu(event: MouseEvent) {
    if (firedRef.current || timerRef.current !== null) event.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onTouchEnd,
    onContextMenu,
  };
}
