const CONFETTI_COLORS = ["#ffd200", "#ff4a5a", "#00d2ff"];

// canvas-confetti is only ever needed on the handful of screens that celebrate something --
// loaded on demand instead of bundled statically, and skipped entirely for the (majority of)
// visitors who have reduced-motion set.
export async function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  confetti({
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
}
