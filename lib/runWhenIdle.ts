/** Schedules `fn` for the browser's next idle period rather than running it synchronously --
 * lets initial paint/hydration finish first so a post-mount prefetch doesn't compete with them.
 * Safari has no requestIdleCallback, hence the setTimeout fallback. Returns a cancel function. */
export function runWhenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    // timeout: forces fn to run even if the browser never reports an idle period (e.g. a tab
    // kept busy by polling/animation) -- a bounded wait beats never running at all.
    const id = window.requestIdleCallback(fn, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}

/** Runs `fns` one at a time, each on its own idle period, so a batch of background work (e.g.
 * several prefetches) doesn't land in a single idle slice and doesn't fire as one network burst.
 * Each fn is only scheduled once the previous one has run. Returns a cancel function that stops
 * the remainder of the sequence. */
export function runWhenIdleSequence(fns: Array<() => void>): () => void {
  let cancelled = false;
  let cancelCurrent: (() => void) | null = null;

  function next(i: number) {
    if (cancelled || i >= fns.length) return;
    cancelCurrent = runWhenIdle(() => {
      fns[i]();
      next(i + 1);
    });
  }
  next(0);

  return () => {
    cancelled = true;
    cancelCurrent?.();
  };
}
