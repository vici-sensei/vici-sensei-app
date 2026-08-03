import type { FocusEvent } from "react";

// Mobile browsers don't reliably keep a focused input visible once the on-screen
// keyboard finishes animating in — these helpers nudge the page back into place
// after a short delay so the keyboard has actually settled first.
const KEYBOARD_SETTLE_MS = 300;

export function scrollIntoViewOnFocus(event: FocusEvent<HTMLElement>) {
  const target = event.currentTarget;
  setTimeout(() => target.scrollIntoView({ block: "center", behavior: "smooth" }), KEYBOARD_SETTLE_MS);
}

export function scrollWindowToTopOnFocus() {
  setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), KEYBOARD_SETTLE_MS);
}
