"use client";

import { useEffect, useRef, useState } from "react";

// Pieces shared by the new-cards charts (NewCardsChart and NewCardsOverlayChart).

export const HEIGHT = 300;
export const MARGIN = { top: 24, right: 16, bottom: 30, left: 46 };
const MIN_WIDTH = 280;

export const SURFACE = "var(--color-bg-main)";
export const INK_MUTED = "var(--color-text-muted)";
// Keeps a label readable where it crosses a line or a band: the surface colour is painted around the glyphs.
export const HALO = { paintOrder: "stroke", stroke: SURFACE, strokeWidth: 4, strokeLinejoin: "round" } as const;
export const GRID = "rgba(255,255,255,0.06)";
export const AXIS = "rgba(255,255,255,0.14)";

const numberFormatter = new Intl.NumberFormat();
export const fmt = (value: number) => numberFormatter.format(Math.round(value));

export const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
export const tickFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
export const tickYearFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });

export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(MIN_WIDTH, Math.round(el.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Whole-number ticks from 0 up to a round top that contains `max`. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = Math.max(max / target, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10) as number;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Exactly `divisions` + 1 whole-number ticks from 0 up to a round top that contains `max`. Two axes
 * with different ranges (kanji on the left, vocabulary on the right) both use it, so they share every gridline. */
export function alignedTicks(max: number, divisions = 4): number[] {
  const rough = Math.max(max / divisions, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10) as number;
  return Array.from({ length: divisions + 1 }, (_, i) => i * step);
}

/**
 * Smooth path through every point (monotone cubic). It never overshoots, so a curve can't dip below zero
 * or rise above a day's real value; the points must be sorted by x.
 */
export function smoothPath(points: [number, number][]): string {
  const n = points.length;
  if (n === 0) return "";
  const at = ([px, py]: [number, number]) => `${px.toFixed(1)} ${py.toFixed(1)}`;
  if (n === 1) return `M${at(points[0])}`;

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === n - 1) return slopes[n - 2];
    // A turning point (or a flat stretch) stays flat; otherwise the harmonic mean keeps each segment monotone.
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (2 * slopes[i - 1] * slopes[i]) / (slopes[i - 1] + slopes[i]);
  });

  let path = `M${at(points[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    path += ` C${at([x0 + dx, y0 + tangents[i] * dx])} ${at([x1 - dx, y1 - tangents[i + 1] * dx])} ${at([x1, y1])}`;
  }
  return path;
}

export function LineKey({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="22" height="8" aria-hidden="true" className="shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "5 3" : undefined} style={{ stroke: color }} />
    </svg>
  );
}
