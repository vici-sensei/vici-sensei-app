"use client";

import { useEffect, useState } from "react";

const MOBILE_MAX_WIDTH = 768; // matches --breakpoint-md in app/globals.css
const KEYBOARD_HEIGHT_THRESHOLD = 150; // px the visual viewport must shrink by to count as "keyboard open"

// Detects the on-screen keyboard by comparing the visual viewport (which shrinks live when the
// keyboard opens) against `window.innerHeight` (the layout viewport, which iOS/Android leave at
// full screen height while the keyboard is up -- see useViewportHeight.ts). Gated to mobile-sized
// viewports so a docked devtools panel or a narrowed desktop window isn't mistaken for a keyboard.
export function useKeyboardOpen(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      const isMobile = window.innerWidth < MOBILE_MAX_WIDTH;
      const shrunk = window.innerHeight - viewport!.height > KEYBOARD_HEIGHT_THRESHOLD;
      setKeyboardOpen(isMobile && shrunk);
    }

    update();
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return keyboardOpen;
}
