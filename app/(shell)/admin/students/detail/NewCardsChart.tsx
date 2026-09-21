"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dayIndex, type PredictionStart, type ProjectionResult, type Track } from "@/lib/study/newCardProjection";
import type { StudentNewCardProgress } from "@/lib/types";

export type ChartView = "cumulative" | "daily";

const HEIGHT = 300;
const MARGIN = { top: 24, right: 16, bottom: 30, left: 46 };
const MIN_WIDTH = 280;

const REAL_COLOR = "var(--color-accent-red)";
const PREDICTED_COLOR = "var(--color-accent-blue)";
const TEST_COLOR = "var(--color-accent-gold)";
const BLOCKED_COLOR = "var(--color-accent-orange)";
const SURFACE = "var(--color-bg-main)";
const INK_MUTED = "var(--color-text-muted)";
// Keeps a label readable where it crosses a line or a band: the surface colour is painted around the glyphs.
const HALO = { paintOrder: "stroke", stroke: SURFACE, strokeWidth: 4, strokeLinejoin: "round" } as const;
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "rgba(255,255,255,0.14)";

const numberFormatter = new Intl.NumberFormat();
const fmt = (value: number) => numberFormatter.format(Math.round(value));

const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
const tickFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const tickYearFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" });

function useElementWidth<T extends HTMLElement>() {
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
function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = Math.max(max / target, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10) as number;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

/**
 * Smooth path through every point (monotone cubic). It never overshoots, so a curve can't dip below zero
 * or rise above a day's real value; the points must be sorted by x.
 */
function smoothPath(points: [number, number][]): string {
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

function LineKey({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="22" height="8" aria-hidden="true" className="shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" strokeWidth="2" strokeLinecap="round" strokeDasharray={dashed ? "5 3" : undefined} style={{ stroke: color }} />
    </svg>
  );
}

interface ChartProps {
  result: ProjectionResult;
  view: ChartView;
  start: PredictionStart;
  track: Track;
  /** Real hiragana/katakana reading tests; only drawn on the kana track. */
  tests: StudentNewCardProgress["tests"];
  reviewCap: number | null;
}

export function NewCardsChart({ result, view, start, track, tests, reviewCap }: ChartProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { days, todayIdx, actual, predicted, poolTotal } = result;
  const n = days.length;
  const cumulative = view === "cumulative";
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseY = MARGIN.top + plotH;
  const stepX = n > 1 ? plotW / (n - 1) : plotW;
  const x = (i: number) => MARGIN.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);

  const realValues = cumulative ? actual.cumulative : actual.perDay;
  const predictedValues = predicted ? (cumulative ? predicted.cumulative : predicted.perDay) : null;
  const predictedAt = (i: number): number | null => {
    if (!predictedValues) return null;
    if (i < predictedValues.length) return predictedValues[i];
    return cumulative ? predictedValues[predictedValues.length - 1] : 0;
  };
  // "From today on" reuses the real days up to today, so its line only starts where reality stops.
  const predictedFrom = start === "today" ? todayIdx : 0;

  let max = 0;
  for (const v of realValues) max = Math.max(max, v);
  if (predictedValues) for (const v of predictedValues) max = Math.max(max, v);
  if (cumulative) max = Math.max(max, poolTotal);
  const ticks = niceTicks(max);
  const yTop = ticks[ticks.length - 1];
  const y = (v: number) => baseY - (v / yTop) * plotH;

  const realPoints = realValues.map((v, i): [number, number] => [x(i), y(v)]);
  const realPath = smoothPath(realPoints);
  // The area under the real line; the curve stays at or above zero, so it never dips under the axis.
  const realArea = realPoints.length > 1 ? `${realPath} L${x(realPoints.length - 1).toFixed(1)} ${baseY} L${x(0).toFixed(1)} ${baseY} Z` : null;
  const predictedPoints: [number, number][] = [];
  if (predictedValues) for (let i = predictedFrom; i < n; i++) predictedPoints.push([x(i), y(predictedAt(i) ?? 0)]);
  const predictedPath = smoothPath(predictedPoints);

  // Evenly spaced date ticks (a whole number of days apart); the last day only gets one when its label has room.
  const maxTicks = Math.max(2, Math.floor(plotW / 90));
  const tickStep = Math.max(1, Math.ceil((n - 1) / (maxTicks - 1)));
  const xTickIdx: number[] = [];
  for (let i = 0; i < n; i += tickStep) xTickIdx.push(i);
  if (n > 1 && (n - 1 - xTickIdx[xTickIdx.length - 1]) * stepX >= 110) xTickIdx.push(n - 1);
  const spansYears = days[0].slice(0, 4) !== days[n - 1].slice(0, 4);

  const realTests = track === "kana" ? tests.map((t) => ({ ...t, idx: dayIndex(result.startDay, t.day) })).filter((t) => t.idx >= 0 && t.idx <= todayIdx) : [];
  const completionIdx = predicted?.completionIdx ?? null;
  // Neighbouring paused days are drawn as one bar -- a long stall can otherwise mean thousands of marks.
  const blockedRuns: { start: number; end: number }[] = [];
  for (const b of predicted?.blocked ?? []) {
    const last = blockedRuns[blockedRuns.length - 1];
    if (last && b.idx === last.end + 1) last.end = b.idx;
    else blockedRuns.push({ start: b.idx, end: b.idx });
  }
  const showToday = n > 1;
  // Near the top of the plot the label above the end dot would run into the "Today" label and test badges.
  const endLabelBesideDot = y(realValues[todayIdx] ?? 0) < MARGIN.top + 40;

  function moveTo(clientX: number, el: SVGSVGElement) {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * width;
    const idx = Math.round(((px - MARGIN.left) / plotW) * (n - 1));
    setHoverIdx(Math.min(n - 1, Math.max(0, idx)));
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    moveTo(e.clientX, e.currentTarget);
  }
  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHoverIdx((prev) => Math.min(n - 1, Math.max(0, (prev ?? todayIdx) + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const hover = hoverIdx == null ? null : hoverIdx;
  const hoverReal = hover != null && hover <= todayIdx ? { perDay: actual.perDay[hover], total: actual.cumulative[hover] } : null;
  const showPredictedAtHover = hover != null && predicted != null && (start === "ideal" || hover > todayIdx);
  const hoverPredicted =
    showPredictedAtHover && hover != null
      ? {
          perDay: hover < predicted.perDay.length ? predicted.perDay[hover] : 0,
          total: hover < predicted.cumulative.length ? predicted.cumulative[hover] : predicted.cumulative[predicted.cumulative.length - 1],
          due: hover < predicted.due.length ? predicted.due[hover] : null,
        }
      : null;
  const notes: string[] = [];
  if (hover != null && showPredictedAtHover && predicted) {
    const blocked = predicted.blocked.find((b) => b.idx === hover);
    if (blocked) notes.push(`No new cards: about ${fmt(blocked.due)} reviews due, at or over the ${reviewCap == null ? "" : `${fmt(reviewCap)} `}cap.`);
    for (const band of predicted.testBands) {
      if (hover >= band.startIdx && hover <= band.endIdx) {
        notes.push(
          band.test === "hiragana"
            ? "Estimated hiragana test period. Katakana starts after it."
            : "Estimated katakana test, after the last new card."
        );
      }
    }
  }
  if (hover != null) {
    for (const t of realTests) {
      if (t.idx === hover) notes.push(`${t.test_type === "hiragana" ? "Hiragana" : "Katakana"} test, attempt ${t.attempt_number}: ${t.percent}%.`);
    }
  }
  const tooltipLeftFrac = hover == null ? 0 : x(hover) / width;

  const hasTestBands = (predicted?.testBands.length ?? 0) > 0;
  const hasBlocked = (predicted?.blocked.length ?? 0) > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-text-muted">
        <span className="flex items-center gap-2">
          <LineKey color={REAL_COLOR} /> Real
        </span>
        {predicted && predictedPoints.length > 1 && (
          <span className="flex items-center gap-2">
            <LineKey color={PREDICTED_COLOR} dashed /> Predicted, {start === "ideal" ? "ideal from day 1" : "from today on"}
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
        {realTests.length > 0 && (
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TEST_COLOR }} /> Reading test taken
          </span>
        )}
        {hasTestBands && (
          <span className="flex items-center gap-2">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[0.55rem] font-extrabold text-bg-main" style={{ background: TEST_COLOR }}>
              T
            </span>
            Estimated reading-test period
          </span>
        )}
        {hasBlocked && (
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-0.5" style={{ background: BLOCKED_COLOR }} /> New cards paused (review cap)
          </span>
        )}
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label="New cards chart. Use the left and right arrow keys to read the values day by day."
          tabIndex={0}
          className="block touch-pan-y select-none outline-offset-2"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverIdx(null)}
          onBlur={() => setHoverIdx(null)}
          onKeyDown={onKeyDown}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: t === 0 ? AXIS : GRID }} />
              <text x={MARGIN.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize="11" style={{ fill: INK_MUTED }}>
                {fmt(t)}
              </text>
            </g>
          ))}
          {xTickIdx.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} fontSize="11" style={{ fill: INK_MUTED }}>
              {(spansYears ? tickYearFormatter : tickFormatter).format(new Date(days[i]))}
            </text>
          ))}

          {realArea && <path d={realArea} style={{ fill: REAL_COLOR, opacity: 0.1 }} />}

          {predicted?.testBands.map((band) => {
            const x0 = Math.max(MARGIN.left, x(band.startIdx) - stepX / 2);
            const x1 = Math.min(width - MARGIN.right, x(band.endIdx) + stepX / 2);
            return (
              <g key={`${band.test}-${band.startIdx}`}>
                <rect x={x0} y={MARGIN.top} width={x1 - x0} height={plotH} style={{ fill: TEST_COLOR, opacity: 0.12 }} />
                <circle cx={(x0 + x1) / 2} cy={MARGIN.top + 9} r="8" strokeWidth="2" style={{ fill: TEST_COLOR, stroke: SURFACE }} />
                <text x={(x0 + x1) / 2} y={MARGIN.top + 12.5} textAnchor="middle" fontSize="10" fontWeight="800" style={{ fill: SURFACE }}>
                  T
                </text>
              </g>
            );
          })}

          {blockedRuns.map((run) => (
            <rect key={run.start} x={x(run.start) - 1} y={baseY - 9} width={Math.max(2, x(run.end) - x(run.start) + 2)} height="9" style={{ fill: BLOCKED_COLOR }} />
          ))}

          {cumulative && poolTotal > 0 && (
            <g>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(poolTotal)} y2={y(poolTotal)} strokeWidth="1" strokeDasharray="2 3" style={{ stroke: INK_MUTED }} />
              <text x={MARGIN.left + 6} y={y(poolTotal) + 14} textAnchor="start" fontSize="11" style={{ fill: INK_MUTED, ...HALO }}>
                Total {fmt(poolTotal)}
              </text>
            </g>
          )}

          {showToday && (
            <g>
              <line x1={x(todayIdx)} x2={x(todayIdx)} y1={MARGIN.top} y2={baseY} strokeWidth="1" style={{ stroke: AXIS }} />
              <text x={x(todayIdx)} y={MARGIN.top - 8} textAnchor={todayIdx === n - 1 ? "end" : todayIdx === 0 ? "start" : "middle"} fontSize="11" style={{ fill: INK_MUTED }}>
                Today
              </text>
            </g>
          )}

          {predictedPath && (
            <path d={predictedPath} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" style={{ stroke: PREDICTED_COLOR }} />
          )}
          {completionIdx != null && completionIdx > todayIdx && predictedAt(completionIdx) != null && (
            <circle cx={x(completionIdx)} cy={y(predictedAt(completionIdx) ?? 0)} r="4" strokeWidth="2" style={{ fill: PREDICTED_COLOR, stroke: SURFACE }} />
          )}

          {n > 1 ? (
            <path d={realPath} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: REAL_COLOR }} />
          ) : null}
          <circle cx={x(todayIdx)} cy={y(realValues[todayIdx] ?? 0)} r="4" strokeWidth="2" style={{ fill: REAL_COLOR, stroke: SURFACE }} />
          <text
            x={endLabelBesideDot ? x(todayIdx) - 10 : x(todayIdx)}
            y={endLabelBesideDot ? y(realValues[todayIdx] ?? 0) + 4 : y(realValues[todayIdx] ?? 0) - 9}
            textAnchor={endLabelBesideDot || todayIdx > n * 0.85 ? "end" : "middle"}
            fontSize="11"
            fontWeight="700"
            style={{ fill: "var(--color-text-main)", ...HALO }}
          >
            {fmt(realValues[todayIdx] ?? 0)}
          </text>

          {realTests.map((t) => (
            <circle key={`${t.test_type}-${t.attempt_number}`} cx={x(t.idx)} cy={y(realValues[t.idx] ?? 0)} r="5" strokeWidth="2" style={{ fill: TEST_COLOR, stroke: SURFACE }} />
          ))}

          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={MARGIN.top} y2={baseY} strokeWidth="1" style={{ stroke: "rgba(255,255,255,0.35)" }} />
              {hoverReal && <circle cx={x(hover)} cy={y(realValues[hover])} r="4" strokeWidth="2" style={{ fill: REAL_COLOR, stroke: SURFACE }} />}
              {hoverPredicted && (
                <circle cx={x(hover)} cy={y(predictedAt(hover) ?? 0)} r="4" strokeWidth="2" style={{ fill: PREDICTED_COLOR, stroke: SURFACE }} />
              )}
            </g>
          )}
        </svg>

        {hover != null && (
          <div
            role="status"
            className={`pointer-events-none absolute top-2 z-10 w-max max-w-64 rounded-lg border border-border-soft bg-bg-main/95 px-3 py-2 text-xs shadow-lg ${
              tooltipLeftFrac > 0.6 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3"
            }`}
            style={{ left: `${tooltipLeftFrac * 100}%` }}
          >
            <div className="mb-1.5 font-semibold text-text-main">{dayFormatter.format(new Date(days[hover]))}</div>
            <div className="flex flex-col gap-1">
              {hoverReal ? (
                <div className="flex items-center gap-2">
                  <LineKey color={REAL_COLOR} />
                  <span className="font-bold text-text-main">{fmt(cumulative ? hoverReal.total : hoverReal.perDay)}</span>
                  <span className="text-text-muted">
                    Real, {cumulative ? `+${fmt(hoverReal.perDay)} that day` : `${fmt(hoverReal.total)} in total`}
                  </span>
                </div>
              ) : (
                <div className="text-text-muted">No real data yet for this day.</div>
              )}
              {hoverPredicted && (
                <div className="flex items-center gap-2">
                  <LineKey color={PREDICTED_COLOR} dashed />
                  <span className="font-bold text-text-main">{fmt(cumulative ? hoverPredicted.total : hoverPredicted.perDay)}</span>
                  <span className="text-text-muted">
                    Predicted, {cumulative ? `+${fmt(hoverPredicted.perDay)} that day` : `${fmt(hoverPredicted.total)} in total`}
                  </span>
                </div>
              )}
              {hoverPredicted?.due != null && hoverPredicted.due >= 0.5 && (
                <div className="text-text-muted">About {fmt(hoverPredicted.due)} reviews due in the prediction.</div>
              )}
              {notes.map((note) => (
                <div key={note} className="text-text-muted">
                  {note}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
