"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

// Sakura-ish palette (pink/blush/white) -- pink listed twice so it's picked ~2x as often as
// either of the other two, matching the original hand-picked set's mix.
const COLORS = ["bg-accent-pink", "bg-accent-pink", "bg-white", "bg-[#ffd9e6]"];

const MIN_SIZE_PX = 7;
const MAX_SIZE_PX = 11;
// Fall speed, not fall duration, is what's randomized -- a fixed duration would cover a short
// card and a tall one in the same amount of time, so the exact same petal would look like it's
// drifting on a small card and racing down a big one. Picking a px/s speed instead and dividing
// the real fall distance (see fallDistancePx below) by it keeps the actual motion looking equally
// gentle regardless of surface height.
const MIN_FALL_SPEED_PX_S = 12;
const MAX_FALL_SPEED_PX_S = 22;
const MIN_DRIFT_DURATION_S = 3.4;
const MAX_DRIFT_DURATION_S = 5;

// Target average center-to-center spacing between petals -- count is derived from
// container area / this squared, so a bigger card gets proportionally more petals instead
// of the same fixed handful looking sparse (or a small card looking overcrowded).
const IDEAL_SPACING_PX = 75;
// Rejection-sampling floor: no two petals may land closer than this, so they never overlap
// (petals top out at ~11px) and never read as an accidental cluster either.
const MIN_GAP_PX = IDEAL_SPACING_PX * 0.55;
const MAX_ATTEMPTS_PER_PETAL = 40;
const MIN_COUNT = 5;
const MAX_COUNT = 18;

// Keep placements off the very edge, both so a petal's own width doesn't get clipped in half
// by the card's overflow-hidden and so the scatter reads as "inside the card" at a glance.
const MARGIN_PCT = 4;

// Matches the vici-confetti-fall keyframes in globals.css (0% -> top: -8%, 100% -> top: 108%).
// The fall animation has only those two keyframes, so it fully owns `top` for its whole
// duration -- a petal's *initial* on-screen position isn't its inline `top` at all, it's
// wherever a negative animation-delay places it on this line. To actually control where a
// petal starts (for the overlap check below) we solve for the delay that puts it there.
const FALL_TOP_START_PCT = -8;
const FALL_TOP_END_PCT = 108;
const FALL_RANGE_PCT = FALL_TOP_END_PCT - FALL_TOP_START_PCT;

function delayForInitialTop(topPct: number, fallDurationS: number): number {
  const elapsedFraction = (topPct - FALL_TOP_START_PCT) / FALL_RANGE_PCT;
  return -(elapsedFraction * fallDurationS);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

interface Petal {
  top: number;
  left: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
  driftDuration: number;
  driftDelay: number;
}

/** Random, non-overlapping petal layout scaled to the container's actual pixel size --
 * `widthPx`/`heightPx` come from the wrapper's own getBoundingClientRect (see SakuraPetals
 * below), since a percent-only layout can't tell a small card's scatter from a dense cluster on
 * a bigger one. Plain rejection sampling: place a petal at a random spot, keep it only if it
 * clears MIN_GAP_PX from every petal already placed, give up on that one slot after
 * MAX_ATTEMPTS_PER_PETAL tries -- self-limiting, so a container too small/full for the target
 * count just ends up with fewer petals instead of forcing an overlap. */
function generatePetals(widthPx: number, heightPx: number): Petal[] {
  const targetCount = Math.round(
    Math.min(
      MAX_COUNT,
      Math.max(MIN_COUNT, ((widthPx * heightPx) / (IDEAL_SPACING_PX * IDEAL_SPACING_PX)) * randomBetween(0.7, 1.3))
    )
  );

  // Real distance a petal travels top-to-bottom (see FALL_RANGE_PCT above) -- the fixed
  // percentage the fall keyframes cover, resolved against this specific surface's actual height.
  const fallDistancePx = (heightPx * FALL_RANGE_PCT) / 100;

  const placedPx: { x: number; y: number }[] = [];
  const petals: Petal[] = [];

  for (let i = 0; i < targetCount; i++) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PETAL; attempt++) {
      const leftPct = randomBetween(MARGIN_PCT, 100 - MARGIN_PCT);
      const topPct = randomBetween(MARGIN_PCT, 100 - MARGIN_PCT);
      const x = (leftPct / 100) * widthPx;
      const y = (topPct / 100) * heightPx;

      const overlaps = placedPx.some((p) => Math.hypot(p.x - x, p.y - y) < MIN_GAP_PX);
      if (overlaps) continue;

      placedPx.push({ x, y });
      const duration = fallDistancePx / randomBetween(MIN_FALL_SPEED_PX_S, MAX_FALL_SPEED_PX_S);
      const driftDuration = randomBetween(MIN_DRIFT_DURATION_S, MAX_DRIFT_DURATION_S);
      petals.push({
        top: topPct,
        left: leftPct,
        size: randomBetween(MIN_SIZE_PX, MAX_SIZE_PX),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        duration,
        delay: delayForInitialTop(topPct, duration),
        driftDuration,
        driftDelay: -randomBetween(0, driftDuration),
      });
      break;
    }
  }

  return petals;
}

/** Falling sakura petals, scattered behind whatever the caller layers on top of it -- shared by
 * the dashboard's streak-record card (DashboardPage's StreakCard) and the achievement-unlock
 * modal (NewAchievementsModal). Always confined to the nearest positioned ancestor: the caller is
 * expected to give that ancestor `relative isolate overflow-hidden` (so this clips to its rounded
 * corners and its own z-20 only has to clear that ancestor's un-indexed content) and to put its
 * own foreground content in a sibling with a higher z-index, so the petals read as falling behind
 * it rather than on top. The layout is random and can only be generated client-side, against the
 * real measured size of whatever it's covering (see generatePetals) -- nothing renders until that
 * first measurement comes back, and a ResizeObserver re-rolls it if that size later changes
 * meaningfully (e.g. a breakpoint change or the window being resized), ignoring the sub-pixel
 * jitter layout/scrollbars otherwise cause. */
export function SakuraPetals() {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [petals, setPetals] = useState<Petal[]>([]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const maybeRegenerate = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const last = lastSizeRef.current;
      if (last && Math.abs(last.width - width) < 4 && Math.abs(last.height - height) < 4) return;
      lastSizeRef.current = { width, height };
      setPetals(generatePetals(width, height));
    };

    maybeRegenerate();
    const observer = new ResizeObserver(maybeRegenerate);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
      {petals.map((petal, i) => (
        <span
          key={i}
          className={`vici-confetti-petal absolute ${petal.color}`}
          style={
            {
              top: `${petal.top}%`,
              left: `${petal.left}%`,
              width: petal.size,
              height: petal.size * 0.72,
              "--confetti-fall-duration": `${petal.duration}s`,
              "--confetti-fall-delay": `${petal.delay}s`,
              "--confetti-drift-duration": `${petal.driftDuration}s`,
              "--confetti-drift-delay": `${petal.driftDelay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
