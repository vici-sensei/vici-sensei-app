"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { projectionForCategory, type PredictionStart, type ProjectionResult } from "@/lib/study/newCardProjection";
import type { ChartView } from "./NewCardsChart";
import {
  AXIS,
  GRID,
  HALO,
  HEIGHT,
  INK_MUTED,
  LineKey,
  MARGIN,
  SURFACE,
  alignedTicks,
  dayFormatter,
  fmt,
  smoothPath,
  tickFormatter,
  tickYearFormatter,
  useElementWidth,
} from "./newCardsChartParts";

// Kanji and vocabulary keep the colours the dashboard's level-progress card gives them.
const SERIES = [
  { category: "kanji", title: "Kanji", color: "var(--color-accent-violet)", axis: "left" },
  { category: "vocabulary", title: "Vocabulary", color: "var(--color-accent-orange)", axis: "right" },
] as const;
// Colour already means "which category" here, so the paused-days bar can't be orange like in the other chart.
const PAUSED_COLOR = "rgba(255,255,255,0.35)";
// The right axis needs the same room the left one has.
const PLOT_MARGIN = { ...MARGIN, right: MARGIN.left };

interface Props {
  result: ProjectionResult;
  view: ChartView;
  start: PredictionStart;
  reviewCap: number | null;
}

/**
 * Kanji and vocabulary in one plot. Vocabulary runs about 6 times higher than kanji, so each one gets its
 * own axis (kanji left, vocabulary right) with the same number of gridlines: a line reaches the top when
 * its category is used up, whatever its size. Colour says which category, solid/dashed says real/predicted.
 */
export function NewCardsOverlayChart({ result, view, start, reviewCap }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const { days, todayIdx, predicted } = result;
  const n = days.length;
  const cumulative = view === "cumulative";
  const plotW = width - PLOT_MARGIN.left - PLOT_MARGIN.right;
  const plotH = HEIGHT - PLOT_MARGIN.top - PLOT_MARGIN.bottom;
  const baseY = PLOT_MARGIN.top + plotH;
  const stepX = n > 1 ? plotW / (n - 1) : plotW;
  const x = (i: number) => PLOT_MARGIN.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  // "From today on" reuses the real days up to today, so its line only starts where reality stops.
  const predictedFrom = start === "today" ? todayIdx : 0;

  const lines = SERIES.map((spec) => {
    const series = projectionForCategory(result, spec.category);
    const real = cumulative ? series.actual.cumulative : series.actual.perDay;
    const forecast = series.predicted ? (cumulative ? series.predicted.cumulative : series.predicted.perDay) : null;
    const forecastAt = (i: number): number | null => {
      if (!forecast) return null;
      if (i < forecast.length) return forecast[i];
      return cumulative ? forecast[forecast.length - 1] : 0;
    };

    let max = 0;
    for (const v of real) max = Math.max(max, v);
    if (forecast) for (const v of forecast) max = Math.max(max, v);
    if (cumulative) max = Math.max(max, series.poolTotal);
    const ticks = alignedTicks(max);
    const yTop = ticks[ticks.length - 1];
    const y = (v: number) => baseY - (v / yTop) * plotH;

    const realPath = smoothPath(real.map((v, i): [number, number] => [x(i), y(v)]));
    const forecastPoints: [number, number][] = [];
    if (forecast) for (let i = predictedFrom; i < n; i++) forecastPoints.push([x(i), y(forecastAt(i) ?? 0)]);

    return {
      ...spec,
      series,
      real,
      forecastAt,
      ticks,
      y,
      realPath,
      forecastPoints,
      forecastPath: smoothPath(forecastPoints),
      poolTotal: series.poolTotal,
      completionIdx: series.predicted?.completionIdx ?? null,
    };
  });

  // Evenly spaced date ticks (a whole number of days apart); the last day only gets one when its label has room.
  const maxTicks = Math.max(2, Math.floor(plotW / 90));
  const tickStep = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)));
  const xTickIdx: number[] = [];
  for (let i = 0; i < n; i += tickStep) xTickIdx.push(i);
  if (n > 1 && (n - 1 - xTickIdx[xTickIdx.length - 1]) * stepX >= 110) xTickIdx.push(n - 1);
  const spansYears = days[0].slice(0, 4) !== days[n - 1].slice(0, 4);

  // Neighbouring paused days are drawn as one bar -- a long stall can otherwise mean thousands of marks.
  const blockedRuns: { start: number; end: number }[] = [];
  for (const b of predicted?.blocked ?? []) {
    const last = blockedRuns[blockedRuns.length - 1];
    if (last && b.idx === last.end + 1) last.end = b.idx;
    else blockedRuns.push({ start: b.idx, end: b.idx });
  }
  const showToday = n > 1;
  const showForecast = lines.some((line) => line.forecastPoints.length > 1);
  const hasBlocked = blockedRuns.length > 0;

  /** Where a line's "today" number goes: above its dot, or (kanji near the top, vocabulary always) out of the
   * way of the other line's number -- below the dot when there is room, else to its left. */
  function endLabel(yv: number, preferBelow: boolean) {
    const cx = x(todayIdx);
    const anchor = todayIdx > n * 0.85 ? "end" : "middle";
    if (preferBelow && yv + 20 <= baseY) return { x: cx, y: yv + 17, anchor } as const;
    if (preferBelow || yv < PLOT_MARGIN.top + 40) return { x: cx - 10, y: yv + 4, anchor: "end" } as const;
    return { x: cx, y: yv - 9, anchor } as const;
  }

  function moveTo(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((px - PLOT_MARGIN.left) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    moveTo(e.clientX, e.currentTarget);
  }
  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover(Math.min(n - 1, Math.max(0, (hover ?? todayIdx) + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const hasReal = hover != null && hover <= todayIdx;
  const hasPredictedAtHover = hover != null && predicted != null && (start === "ideal" || hover > todayIdx);
  const blockedAtHover = hasPredictedAtHover && predicted ? predicted.blocked.find((b) => b.idx === hover) : undefined;
  const dueAtHover = hasPredictedAtHover && predicted && hover < predicted.due.length ? predicted.due[hover] : null;
  const tooltipLeftFrac = hover == null ? 0 : x(hover) / width;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-text-muted">
        {lines.map((line) => (
          <span key={line.category} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: line.color }} /> {line.title} ({line.axis} axis)
          </span>
        ))}
        <span className="flex items-center gap-2">
          <LineKey color={INK_MUTED} /> Real
        </span>
        {showForecast && (
          <span className="flex items-center gap-2">
            <LineKey color={INK_MUTED} dashed /> Predicted, {start === "ideal" ? "ideal from day 1" : "from today on"}
          </span>
        )}
        {cumulative && (
          <span className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="21" y2="4" strokeWidth="1" strokeDasharray="2 3" style={{ stroke: INK_MUTED }} />
            </svg>
            Total to learn
          </span>
        )}
        {hasBlocked && (
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-0.5" style={{ background: PAUSED_COLOR }} /> New cards paused (review cap)
          </span>
        )}
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label="Kanji and vocabulary new cards chart. Use the left and right arrow keys to read the values day by day."
          tabIndex={0}
          className="block touch-pan-y select-none outline-offset-2"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          {/* Both axes have the same number of gridlines, so one set of lines serves both. */}
          {lines[0].ticks.map((_, row) => {
            const gy = baseY - (row / (lines[0].ticks.length - 1)) * plotH;
            return (
              <g key={row}>
                <line x1={PLOT_MARGIN.left} x2={width - PLOT_MARGIN.right} y1={gy} y2={gy} strokeWidth="1" style={{ stroke: row === 0 ? AXIS : GRID }} />
                {lines.map((line) => (
                  <text
                    key={line.category}
                    x={line.axis === "left" ? PLOT_MARGIN.left - 8 : width - PLOT_MARGIN.right + 8}
                    y={gy + 3.5}
                    textAnchor={line.axis === "left" ? "end" : "start"}
                    fontSize="11"
                    style={{ fill: line.color }}
                  >
                    {fmt(line.ticks[row])}
                  </text>
                ))}
              </g>
            );
          })}
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} fontSize="11" style={{ fill: INK_MUTED }}>
              {(spansYears ? tickYearFormatter : tickFormatter).format(new Date(days[i]))}
            </text>
          ))}

          {blockedRuns.map((run) => (
            <rect key={run.start} x={x(run.start) - 1} y={baseY - 9} width={Math.max(2, x(run.end) - x(run.start) + 2)} height="9" style={{ fill: PAUSED_COLOR }} />
          ))}

          {cumulative &&
            lines.map(
              (line) =>
                line.poolTotal > 0 && (
                  <g key={line.category}>
                    <line x1={PLOT_MARGIN.left} x2={width - PLOT_MARGIN.right} y1={line.y(line.poolTotal)} y2={line.y(line.poolTotal)} strokeWidth="1" strokeDasharray="2 3" style={{ stroke: line.color, opacity: 0.7 }} />
                    <text
                      x={line.axis === "left" ? PLOT_MARGIN.left + 6 : width - PLOT_MARGIN.right - 6}
                      // Under the line on the left; above it on the right, where the prediction arrives from below.
                      y={line.axis === "right" && line.y(line.poolTotal) > PLOT_MARGIN.top + 14 ? line.y(line.poolTotal) - 6 : line.y(line.poolTotal) + 14}
                      textAnchor={line.axis === "left" ? "start" : "end"}
                      fontSize="11"
                      style={{ fill: line.color, ...HALO }}
                    >
                      {line.title} total {fmt(line.poolTotal)}
                    </text>
                  </g>
                )
            )}

          {showToday && (
            <g>
              <line x1={x(todayIdx)} x2={x(todayIdx)} y1={PLOT_MARGIN.top} y2={baseY} strokeWidth="1" style={{ stroke: AXIS }} />
              <text x={x(todayIdx)} y={PLOT_MARGIN.top - 8} textAnchor={todayIdx === n - 1 ? "end" : todayIdx === 0 ? "start" : "middle"} fontSize="11" style={{ fill: INK_MUTED }}>
                Today
              </text>
            </g>
          )}

          {lines.map((line) => (
            <g key={line.category}>
              {line.forecastPath && (
                <path d={line.forecastPath} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" style={{ stroke: line.color }} />
              )}
              {line.completionIdx != null && line.completionIdx > todayIdx && line.forecastAt(line.completionIdx) != null && (
                <circle cx={x(line.completionIdx)} cy={line.y(line.forecastAt(line.completionIdx) ?? 0)} r="4" strokeWidth="2" style={{ fill: line.color, stroke: SURFACE }} />
              )}
              {n > 1 && <path d={line.realPath} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: line.color }} />}
              <circle cx={x(todayIdx)} cy={line.y(line.real[todayIdx] ?? 0)} r="4" strokeWidth="2" style={{ fill: line.color, stroke: SURFACE }} />
            </g>
          ))}
          {lines.map((line) => {
            const label = endLabel(line.y(line.real[todayIdx] ?? 0), line.axis === "right");
            return (
              <text key={line.category} x={label.x} y={label.y} textAnchor={label.anchor} fontSize="11" fontWeight="700" style={{ fill: line.color, ...HALO }}>
                {fmt(line.real[todayIdx] ?? 0)}
              </text>
            );
          })}

          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PLOT_MARGIN.top} y2={baseY} strokeWidth="1" style={{ stroke: "rgba(255,255,255,0.35)" }} />
              {lines.map((line) => (
                <g key={line.category}>
                  {hasReal && <circle cx={x(hover)} cy={line.y(line.real[hover])} r="4" strokeWidth="2" style={{ fill: line.color, stroke: SURFACE }} />}
                  {hasPredictedAtHover && line.forecastAt(hover) != null && (
                    <circle cx={x(hover)} cy={line.y(line.forecastAt(hover) ?? 0)} r="4" strokeWidth="2" style={{ fill: line.color, stroke: SURFACE }} />
                  )}
                </g>
              ))}
            </g>
          )}
        </svg>

        {hover != null && (
          <div
            role="status"
            className={`pointer-events-none absolute top-2 z-10 w-max max-w-72 rounded-lg border border-border-soft bg-bg-main/95 px-3 py-2 text-xs shadow-lg ${
              tooltipLeftFrac > 0.5 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3"
            }`}
            style={{ left: `${tooltipLeftFrac * 100}%` }}
          >
            <div className="mb-1.5 font-semibold text-text-main">{dayFormatter.format(new Date(days[hover]))}</div>
            <div className="flex flex-col gap-1">
              {hasReal ? (
                lines.map((line) => (
                  <div key={line.category} className="flex items-center gap-2">
                    <LineKey color={line.color} />
                    <span className="font-bold text-text-main">{fmt(cumulative ? line.series.actual.cumulative[hover] : line.series.actual.perDay[hover])}</span>
                    <span className="text-text-muted">
                      {line.title}, real,{" "}
                      {cumulative ? `+${fmt(line.series.actual.perDay[hover])} that day` : `${fmt(line.series.actual.cumulative[hover])} in total`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-text-muted">No real data yet for this day.</div>
              )}
              {hasPredictedAtHover &&
                predicted &&
                lines.map((line) => {
                  const byDay = line.series.predicted?.perDay ?? [];
                  const totals = line.series.predicted?.cumulative ?? [];
                  const perDay = hover < byDay.length ? byDay[hover] : 0;
                  const total = hover < totals.length ? totals[hover] : (totals[totals.length - 1] ?? 0);
                  return (
                    <div key={line.category} className="flex items-center gap-2">
                      <LineKey color={line.color} dashed />
                      <span className="font-bold text-text-main">{fmt(cumulative ? total : perDay)}</span>
                      <span className="text-text-muted">
                        {line.title}, predicted, {cumulative ? `+${fmt(perDay)} that day` : `${fmt(total)} in total`}
                      </span>
                    </div>
                  );
                })}
              {dueAtHover != null && dueAtHover >= 0.5 && <div className="text-text-muted">About {fmt(dueAtHover)} reviews due in the prediction.</div>}
              {blockedAtHover && (
                <div className="text-text-muted">
                  No new cards: about {fmt(blockedAtHover.due)} reviews due, at or over the {reviewCap == null ? "" : `${fmt(reviewCap)} `}cap.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
