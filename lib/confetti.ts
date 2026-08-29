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
  });
}
