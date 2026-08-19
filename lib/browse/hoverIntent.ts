const HOVER_INTENT_DELAY_MS = 200;

/** Debounces mouse-hover intent so a fast pass over many rows (e.g. scrolling a long list with
 * the mouse) doesn't fire a prefetch per row -- only sustained hover past the delay does.
 * Touch and focus fire immediately since each is already naturally scoped to one target (a
 * single touch point / one focused element at a time). Plain closures, not a hook, so it's
 * safe to create fresh per row inside a .map() without tripping the rules of hooks. */
export function createHoverIntent(onIntent: () => void, delayMs = HOVER_INTENT_DELAY_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  return {
    onMouseEnter: () => {
      cancel();
      timeoutId = setTimeout(onIntent, delayMs);
    },
    onMouseLeave: cancel,
    onFocus: onIntent,
    onTouchStart: onIntent,
  };
}
