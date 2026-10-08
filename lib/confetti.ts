const CONFETTI_COLORS = ["#ffd200", "#ff4a5a", "#00d2ff"];

// stopCelebration() bumps `epoch`, so a celebrate() that was still waiting on the dynamic import
// when it ran can tell it was cancelled and never fires. `playing` counts celebrations started in
// the current epoch that haven't finished -- it's what stopCelebration() reports back.
let epoch = 0;
let playing = 0;
let loadedConfetti: typeof import("canvas-confetti") | null = null;

// canvas-confetti is only ever needed on the handful of screens that celebrate something --
// loaded on demand instead of bundled statically, and skipped entirely for the (majority of)
// visitors who have reduced-motion set.
export async function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const startedInEpoch = epoch;
  playing++;
  const { default: confetti } = await import("canvas-confetti");
  loadedConfetti = confetti;
  if (epoch !== startedInEpoch) return;
  await confetti({
    particleCount: 120,
    spread: 80,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors: CONFETTI_COLORS,
    // canvas-confetti defaults to z-index 100, which sits behind Modal.tsx's z-[200] backdrop --
    // every caller of celebrate() fires it from inside (or right before) a Modal, so it needs to
    // render above that, not underneath it.
    zIndex: 250,
  });
  if (epoch === startedInEpoch) playing--;
}

/** Cuts off whatever celebrate() has going (clearing the canvas) and cancels any that is still
 * loading. Returns whether there was anything to cut off, so a caller can decide to celebrate again
 * later (see useModalConfetti). */
export function stopCelebration(): boolean {
  const wasPlaying = playing > 0;
  epoch++;
  playing = 0;
  loadedConfetti?.reset();
  return wasPlaying;
}
