import type { ReactNode } from "react";

// A soft radial glow behind the top of the "you're done" screens. Written out per tone because
// Tailwind only generates classes it can find as whole strings.
const GLOWS = {
  gold: "before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.08)_0%,transparent_55%)]",
  goldStrong: "before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.12)_0%,transparent_55%)]",
  blue: "before:bg-[radial-gradient(circle_at_50%_15%,rgb(0_210_255/0.08)_0%,transparent_55%)]",
} as const;

/** Full-screen stage for a session / test summary: content centered over a glow. `className` carries
 * the screen's own sizing and padding (min-h-screen px-6 py-[60px], h-screen p-4...). Callers put
 * their content in a `relative` box so it stays above the glow. */
export function CelebrationBackdrop({
  glow,
  className = "",
  children,
}: {
  glow: keyof typeof GLOWS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden before:pointer-events-none before:absolute before:inset-0 ${GLOWS[glow]} ${className}`.trimEnd()}
    >
      {children}
    </div>
  );
}
