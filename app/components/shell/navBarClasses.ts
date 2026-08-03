// Anchored via `top: var(--app-height)` + a full translateY instead of `bottom: 0`.
// `bottom: 0` pins to the layout viewport, which iOS/Android leave full-height when the
// on-screen keyboard opens — so the bar ends up hidden behind the keyboard while scrolled
// page content rises to occupy its space. `--app-height` tracks the visual viewport
// (kept in sync by useViewportHeight), so this stays docked just above the keyboard.
export const navBarClasses =
  "fixed inset-x-0 top-[var(--app-height,100dvh)] -translate-y-full z-60 flex flex-row justify-around border-t border-border-soft bg-bg-main/92 backdrop-blur-[12px] md:static md:top-auto md:translate-y-0 md:w-55 md:shrink-0 md:flex-col md:justify-start md:gap-1.5 md:border-t-0 md:bg-transparent md:backdrop-blur-none md:px-3.5 md:py-6";
