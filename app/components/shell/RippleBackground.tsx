"use client";

import { useEffect, useRef } from "react";

type Range = readonly [number, number];

const MAX_ACTIVE = 18;
const BURST_INTERVAL: Range = [900, 2200];
const RINGS_PER_BURST = 3;
const RING_STAGGER: Range = [380, 620];
const SIZE_RANGE: Range = [240, 320]; // ambient drops always read as large
const DURATION_RANGE: Range = [4200, 8000];
const PEAK_OPACITY: Range = [0.32, 0.58];

const POINTER_MIN_INTERVAL = 220;
const POINTER_MIN_DISTANCE = 90;
const POINTER_SIZE_RANGE: Range = [40, 90];
const POINTER_DURATION_RANGE: Range = [1100, 1900];

function rand([min, max]: Range) {
  return min + Math.random() * (max - min);
}

function scale([min, max]: Range, factor: number): Range {
  return [min * factor, max * factor];
}

function spawnRing(
  field: HTMLDivElement,
  x: string,
  y: string,
  size: number,
  duration: number,
  delay: number,
  peak: number,
) {
  const el = document.createElement("div");
  el.className = "ripple";
  el.style.setProperty("--x", x);
  el.style.setProperty("--y", y);
  el.style.setProperty("--size", `${size}px`);
  el.style.setProperty("--duration", `${duration}ms`);
  el.style.setProperty("--delay", `${delay}ms`);
  el.style.setProperty("--peak", peak.toFixed(3));
  field.appendChild(el);
  setTimeout(() => el.remove(), delay + duration + 60);
}

// One "drop": three rings sharing a center point, each starting a beat
// after the last, so they read as concentric waves rather than one ring.
function spawnBurst(field: HTMLDivElement, speed: number) {
  const x = `${rand([0, 100])}%`;
  const y = `${rand([0, 100])}%`;
  const size = Math.round(rand(SIZE_RANGE));
  const duration = Math.round(rand(scale(DURATION_RANGE, speed)));
  const basePeak = rand(PEAK_OPACITY);

  for (let i = 0; i < RINGS_PER_BURST; i++) {
    const delay = Math.round(i * rand(scale(RING_STAGGER, speed)));
    const peak = basePeak * (1 - i * 0.14); // each later ring a touch fainter
    spawnRing(field, x, y, size, duration, delay, peak);
  }
}

/**
 * Fixed, full-viewport layer of discreet blue ripples: ambient concentric
 * drops plus a trail that follows the cursor while it's moving. Renders
 * behind whatever comes after it in the DOM (no explicit z-index -- relies
 * on being mounted first, before the page chrome).
 *
 * `speed` scales every timing (burst interval, ring stagger, ring duration)
 * -- 1 is the default pace, higher values slow the animation down.
 */
export function RippleBackground({ speed = 1 }: { speed?: number }) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // Render a few static, motionless bursts instead of animating. No
      // pointer trail either -- it's a motion effect by definition.
      for (let i = 0; i < 3; i++) spawnBurst(field, speed);
      return;
    }

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (field.childElementCount < MAX_ACTIVE) spawnBurst(field, speed);
      setTimeout(tick, rand(scale(BURST_INTERVAL, speed)));
    };
    tick();

    let lastSpawn = 0;
    let lastX: number | null = null;
    let lastY: number | null = null;

    // Trails a small ring behind a moving pointer, throttled by both time
    // and distance so a fast sweep doesn't flood the DOM. Shared by mouse
    // (pointermove) and touch (touchstart/touchmove) so both gate off the
    // same clock and last-position state.
    const trySpawnTrail = (clientX: number, clientY: number, force: boolean) => {
      const rect = field.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      const now = performance.now();
      const movedFar = lastX === null || Math.hypot(x - lastX, y - (lastY as number)) >= POINTER_MIN_DISTANCE;
      if (!force && (!movedFar || now - lastSpawn < POINTER_MIN_INTERVAL)) return;

      lastSpawn = now;
      lastX = x;
      lastY = y;
      spawnRing(
        field,
        `${x}px`,
        `${y}px`,
        Math.round(rand(POINTER_SIZE_RANGE)),
        Math.round(rand(scale(POINTER_DURATION_RANGE, speed))),
        0,
        rand(PEAK_OPACITY),
      );
    };

    // Mouse/pen only -- touch is handled below via dedicated touch events,
    // since real touchscreens send pointercancel (and stop pointermove) the
    // moment the browser recognizes the drag as a scroll/pan gesture.
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      trySpawnTrail(e.clientX, e.clientY, false);
    };

    // Touch has no hover, so contact itself has to leave the first mark --
    // spawn right on touchdown (force: true bypasses the distance gate).
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      trySpawnTrail(t.clientX, t.clientY, true);
    };

    // touchmove keeps firing for the life of the touch even once the page
    // starts natively scrolling (unlike pointermove), so this is what
    // actually trails a dragged finger. Passive: never blocks that scroll.
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      trySpawnTrail(t.clientX, t.clientY, false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [speed]);

  return <div ref={fieldRef} className="ripple-field" aria-hidden="true" />;
}
