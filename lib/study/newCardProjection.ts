import {
  DEFAULT_EASE_FACTOR,
  EASE_AGAIN_PENALTY,
  GRADUATING_INTERVAL_DAYS,
  MIN_EASE_FACTOR,
  SECOND_INTERVAL_DAYS,
} from "@/lib/srs/constants";
import type { NewCardCategory, StudentNewCardProgress } from "@/lib/types";

/** Katakana's first day comes this many days after hiragana's last one -- stands in for the hiragana
 * reading test that has to be passed first (the real student: last hiragana 10 Sep, first katakana 13 Sep). */
export const KANA_TEST_PAUSE_DAYS = 3;
/** "Recent average" looks at this many calendar days ending today. */
export const RECENT_AVERAGE_DAYS = 30;
/** A prediction that has not finished by then is reported as "not finished" instead of running on. */
export const PROJECTION_HORIZON_DAYS = 365 * 5;

export type Track = "standard" | "kana";
export type PredictionStart = "ideal" | "today";
export type PaceSource = { kind: "settings" } | { kind: "average" } | { kind: "fixed"; perDay: number };

export const STANDARD_CATEGORIES: readonly NewCardCategory[] = ["kanji", "vocabulary"];
export const KANA_CATEGORIES: readonly NewCardCategory[] = ["hiragana_reading", "katakana_reading"];

export interface ProjectionParams {
  track: Track;
  /** Selected JLPT levels; only read on the standard track (kana has no levels). */
  levels: readonly string[];
  progress: StudentNewCardProgress;
  /** The student's own daily new-card caps (user_study_settings.new_*_per_day), 0 when unset. */
  settingsCaps: Record<NewCardCategory, number>;
  pace: PaceSource;
  /** Daily cap on reviews of already-learned cards (max_reviews_per_day); null = no limit. */
  reviewCap: number | null;
  /** Share of reviews answered right, 0..1. */
  accuracy: number;
  start: PredictionStart;
}

export interface PredictionSeries {
  /** Index 0 = the start day. Both arrays run to `endIdx`. */
  perDay: number[];
  cumulative: number[];
  /** Expected number of already-learned cards waiting for review each day, before the daily cap. */
  due: number[];
  /** Day index of the last new card, or null when the pool is not used up within the horizon. */
  completionIdx: number | null;
  /** Days on which the review cap stopped new cards from being introduced. */
  blocked: { idx: number; due: number }[];
  /** Days that stand for a hiragana/katakana reading test (kana track only). */
  testBands: { startIdx: number; endIdx: number; test: "hiragana" | "katakana" }[];
  endIdx: number;
}

export interface ProjectionSummary {
  seen: number;
  poolTotal: number;
  /** Cards/day the student really averaged over the last RECENT_AVERAGE_DAYS calendar days. */
  recentAverage: number;
  /** Combined daily target the student set for the active categories. */
  settingsCapPerDay: number;
  completionDay: string | null;
  daysLeft: number | null;
  /** Actual minus ideal at today (negative = behind), and how many days that is worth. */
  vsIdeal: { cards: number; days: number | null } | null;
}

export interface ProjectionResult {
  /** X axis: every day from `startDay` to the end of the prediction (or today). */
  days: string[];
  /** The day the student saw their first card on this track; today when they haven't yet. */
  startDay: string;
  /** False when the student has seen no card on this track yet (the chart then starts today). */
  hasHistory: boolean;
  todayIdx: number;
  actual: { perDay: number[]; cumulative: number[] };
  poolTotal: number;
  /** The prediction for the chosen `start`; null when nothing can be predicted (no pool or no target). */
  predicted: PredictionSeries | null;
  /** Always the ideal-from-day-1 run, for the summary's ahead/behind number. */
  ideal: PredictionSeries | null;
  summary: ProjectionSummary;
  /** Daily target per active category the prediction used. */
  targets: Record<string, number>;
  categories: readonly NewCardCategory[];
}

const MS_PER_DAY = 86_400_000;

function parseDay(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dayIndex(from: string, day: string): number {
  return Math.round((parseDay(day) - parseDay(from)) / MS_PER_DAY);
}

export function addDays(from: string, offset: number): string {
  return new Date(parseDay(from) + offset * MS_PER_DAY).toISOString().slice(0, 10);
}

// Ease is kept in hundredths (250 = 2.5) so it can be part of a state key without float noise.
const DEFAULT_EASE_CENTS = Math.round(DEFAULT_EASE_FACTOR * 100);
const EASE_AGAIN_CENTS = Math.round(EASE_AGAIN_PENALTY * 100);
const MIN_EASE_CENTS = Math.round(MIN_EASE_FACTOR * 100);

interface DueEntry {
  reps: number;
  interval: number;
  ease: number;
  w: number;
}

interface SimConfig {
  categories: readonly NewCardCategory[];
  /** Kana: the second category only starts once the first one is used up, plus KANA_TEST_PAUSE_DAYS. */
  sequential: boolean;
  pool: Record<string, number>;
  /** Real per-day introductions for day indexes 0..realThrough (no cap gate applies to those). */
  realIntros: Record<string, number[]> | null;
  realThrough: number;
  targets: Record<string, number>;
  reviewCap: number | null;
  accuracy: number;
  horizon: number;
  /** Keep simulating (reviews only) at least up to this day index even when finished earlier. */
  minEnd: number;
}

/** Expected-value replay of the review queue -- deterministic, so the chart never jitters.
 *
 * Each introduced card is followed through the same review-phase arithmetic lib/srs/scheduler.ts
 * (applyReviewPhaseReview) and compute_review_result (20260820_submit_review_rpc.sql) use: the first
 * review is due the day after introduction, then `reps+1`; reps 1 -> 1 day, reps 2 -> 6 days, after that
 * `round(interval * ease)`; a wrong answer drops ease by 0.2 (min 1.3) and the card is back at 1 day.
 * scheduler.ts itself can't be replayed over simulated dates (it reads Date.now()), so only the
 * arithmetic is mirrored here -- keep the two in step. The learning steps (1 and 10 minutes) stay inside
 * the introduction day and aren't reviews of an already-learned card, which is what the daily cap counts
 * (see 20261241_daily_review_cap_for_old_cards.sql).
 *
 * Every state is a bucket of a fractional number of cards. On a day with more due cards than the cap the
 * same fraction of every bucket is served and the rest waits a day (deferred, never dropped). New cards
 * are only introduced on days the due count is below the cap. */
function simulate(cfg: SimConfig): PredictionSeries {
  const { categories, sequential, pool, realIntros, realThrough, targets, reviewCap, accuracy, horizon, minEnd } = cfg;

  const remaining: Record<string, number> = {};
  const carry: Record<string, number> = {};
  const lastIntro: Record<string, number> = {};
  const firstIntro: Record<string, number> = {};
  for (const c of categories) {
    remaining[c] = pool[c] ?? 0;
    carry[c] = 0;
    lastIntro[c] = -Infinity;
    firstIntro[c] = Infinity;
  }

  const dueByDay: (Map<string, DueEntry> | undefined)[] = [];
  function schedule(day: number, reps: number, interval: number, ease: number, w: number) {
    if (w < 1e-9 || day > horizon) return;
    const bucket = (dueByDay[day] ??= new Map());
    const key = `${reps}|${interval}|${ease}`;
    const existing = bucket.get(key);
    if (existing) existing.w += w;
    else bucket.set(key, { reps, interval, ease, w });
  }

  function mayStart(cat: NewCardCategory, day: number): boolean {
    if (!sequential || cat === categories[0]) return true;
    if (firstIntro[cat] !== Infinity) return true;
    return remaining[categories[0]] === 0 && day >= lastIntro[categories[0]] + KANA_TEST_PAUSE_DAYS;
  }

  const perDay: number[] = [];
  const dueSeries: number[] = [];
  const blocked: { idx: number; due: number }[] = [];
  let completionIdx: number | null = null;

  for (let d = 0; d <= horizon; d++) {
    const today = dueByDay[d];
    let dueCount = 0;
    if (today) for (const e of today.values()) dueCount += e.w;
    dueSeries.push(dueCount);

    const served = reviewCap == null ? dueCount : Math.min(dueCount, reviewCap);
    const servedShare = dueCount > 0 ? served / dueCount : 0;
    if (today) {
      for (const e of today.values()) {
        const reviewed = e.w * servedShare;
        schedule(d + 1, e.reps, e.interval, e.ease, e.w - reviewed);
        if (reviewed <= 0) continue;
        const right = reviewed * accuracy;
        const reps = e.reps + 1;
        const interval =
          reps === 1 ? GRADUATING_INTERVAL_DAYS : reps === 2 ? SECOND_INTERVAL_DAYS : Math.max(1, Math.round((e.interval * e.ease) / 100));
        schedule(d + interval, reps, interval, e.ease, right);
        schedule(d + 1, 1, GRADUATING_INTERVAL_DAYS, Math.max(MIN_EASE_CENTS, e.ease - EASE_AGAIN_CENTS), reviewed - right);
      }
      dueByDay[d] = undefined;
    }

    const isReal = d <= realThrough;
    const gateOpen = reviewCap == null || dueCount < reviewCap;
    let introducedToday = 0;
    let someoneWaiting = false;
    for (const cat of categories) {
      let n = 0;
      if (isReal) {
        n = realIntros?.[cat]?.[d] ?? 0;
      } else if (remaining[cat] > 0 && mayStart(cat, d)) {
        someoneWaiting = true;
        if (gateOpen) {
          carry[cat] += targets[cat] ?? 0;
          n = Math.min(Math.floor(carry[cat] + 1e-9), remaining[cat]);
          carry[cat] -= n;
        }
      }
      if (n > 0) {
        remaining[cat] = Math.max(0, remaining[cat] - n);
        lastIntro[cat] = d;
        if (firstIntro[cat] === Infinity) firstIntro[cat] = d;
        introducedToday += n;
      }
    }
    if (!isReal && someoneWaiting && !gateOpen) blocked.push({ idx: d, due: dueCount });
    schedule(d + 1, 1, GRADUATING_INTERVAL_DAYS, DEFAULT_EASE_CENTS, introducedToday);
    perDay.push(introducedToday);

    if (completionIdx === null && categories.every((c) => remaining[c] <= 0)) {
      completionIdx = Math.max(...categories.map((c) => lastIntro[c]));
    }
    if (completionIdx !== null && d >= minEnd) break;
  }

  const cumulative: number[] = [];
  let running = 0;
  for (const n of perDay) cumulative.push((running += n));

  const testBands: PredictionSeries["testBands"] = [];
  if (sequential) {
    const [first, second] = categories;
    if (remaining[first] === 0 && Number.isFinite(lastIntro[first])) {
      const start = lastIntro[first] + 1;
      const end = firstIntro[second] !== Infinity ? firstIntro[second] - 1 : lastIntro[first] + KANA_TEST_PAUSE_DAYS - 1;
      if (end >= start && end > realThrough) testBands.push({ startIdx: start, endIdx: end, test: "hiragana" });
    }
    if (remaining[second] === 0 && Number.isFinite(lastIntro[second]) && lastIntro[second] + 1 > realThrough) {
      testBands.push({ startIdx: lastIntro[second] + 1, endIdx: lastIntro[second] + 1, test: "katakana" });
    }
  }

  return { perDay, cumulative, due: dueSeries, completionIdx, blocked, testBands, endIdx: perDay.length - 1 };
}

function windowAverage(perDay: number[], todayIdx: number): number {
  const start = Math.max(0, todayIdx - (RECENT_AVERAGE_DAYS - 1));
  let sum = 0;
  for (let i = start; i <= todayIdx; i++) sum += perDay[i] ?? 0;
  return sum / (todayIdx - start + 1);
}

function resolveTargets(
  pace: PaceSource,
  track: Track,
  categories: readonly NewCardCategory[],
  settingsCaps: Record<NewCardCategory, number>,
  actualByCat: Record<string, number[]>,
  todayIdx: number
): Record<string, number> {
  const targets: Record<string, number> = {};
  if (pace.kind === "settings") {
    for (const c of categories) targets[c] = settingsCaps[c] ?? 0;
  } else if (pace.kind === "fixed") {
    if (track === "kana") {
      for (const c of categories) targets[c] = pace.perDay;
    } else {
      const k = settingsCaps.kanji ?? 0;
      const v = settingsCaps.vocabulary ?? 0;
      const kanjiShare = k + v > 0 ? k / (k + v) : 1 / 7;
      targets.kanji = pace.perDay * kanjiShare;
      targets.vocabulary = pace.perDay - targets.kanji;
    }
  } else if (track === "kana") {
    const combined = categories.reduce((sum, c) => sum + windowAverage(actualByCat[c], todayIdx), 0);
    for (const c of categories) targets[c] = combined;
  } else {
    for (const c of categories) targets[c] = windowAverage(actualByCat[c], todayIdx);
  }
  return targets;
}

function levelMatches(track: Track, levels: readonly string[], level: string | null): boolean {
  return track === "kana" || (level != null && levels.includes(level));
}

export function projectNewCards(params: ProjectionParams): ProjectionResult {
  const { track, levels, progress, settingsCaps, pace, reviewCap, accuracy, start } = params;
  const categories = track === "kana" ? KANA_CATEGORIES : STANDARD_CATEGORIES;

  // The chart starts the day the student saw their first card on this track (whatever its level, so
  // ticking levels never moves the start). Before that they weren't on the track at all. With no card
  // yet there is nothing to anchor to, so the chart starts today.
  let firstDay: string | null = null;
  for (const row of progress.history) {
    if (row.count > 0 && categories.includes(row.category) && (firstDay === null || row.day < firstDay)) firstDay = row.day;
  }
  const hasHistory = firstDay !== null;
  const startDay = firstDay ?? progress.today;
  const todayIdx = Math.max(0, dayIndex(startDay, progress.today));

  const pool: Record<string, number> = {};
  for (const c of categories) pool[c] = 0;
  for (const row of progress.pool) {
    if (categories.includes(row.category) && levelMatches(track, levels, row.level)) pool[row.category] += row.total;
  }
  const poolTotal = categories.reduce((sum, c) => sum + pool[c], 0);

  const actualByCat: Record<string, number[]> = {};
  for (const c of categories) actualByCat[c] = new Array(todayIdx + 1).fill(0);
  for (const row of progress.history) {
    if (!categories.includes(row.category) || !levelMatches(track, levels, row.level)) continue;
    const idx = Math.min(todayIdx, Math.max(0, dayIndex(startDay, row.day)));
    actualByCat[row.category][idx] += row.count;
  }
  const actualPerDay = new Array<number>(todayIdx + 1).fill(0);
  for (const c of categories) for (let i = 0; i <= todayIdx; i++) actualPerDay[i] += actualByCat[c][i];
  const actualCumulative: number[] = [];
  let running = 0;
  for (const n of actualPerDay) actualCumulative.push((running += n));
  const seen = running;

  const targets = resolveTargets(pace, track, categories, settingsCaps, actualByCat, todayIdx);
  const targetSum = categories.reduce((sum, c) => sum + (targets[c] ?? 0), 0);
  const canPredict = poolTotal > 0 && targetSum > 0;

  const base = {
    categories,
    sequential: track === "kana",
    pool,
    targets,
    reviewCap,
    accuracy,
    horizon: PROJECTION_HORIZON_DAYS,
    minEnd: todayIdx,
  };
  const ideal = canPredict ? simulate({ ...base, realIntros: null, realThrough: -1 }) : null;
  const fromToday = canPredict ? simulate({ ...base, realIntros: actualByCat, realThrough: todayIdx }) : null;
  const predicted = start === "ideal" ? ideal : fromToday;

  // The axis also has to reach the last reading-test marker, which sits the day after the last new card.
  const lastTestIdx = Math.max(-1, ...(predicted?.testBands.map((band) => band.endIdx) ?? []));
  const endIdx = Math.max(todayIdx, predicted?.endIdx ?? 0, lastTestIdx);
  const days = Array.from({ length: endIdx + 1 }, (_, i) => addDays(startDay, i));

  const recentAverage = categories.reduce((sum, c) => sum + windowAverage(actualByCat[c], todayIdx), 0);
  let settingsCapPerDay: number;
  if (track === "standard") {
    settingsCapPerDay = categories.reduce((sum, c) => sum + (settingsCaps[c] ?? 0), 0);
  } else {
    // Only one script is being introduced at a time: hiragana until it is used up, then katakana.
    const hiraganaLeft = pool.hiragana_reading - actualByCat.hiragana_reading.reduce((a, b) => a + b, 0);
    settingsCapPerDay = hiraganaLeft > 0 ? settingsCaps.hiragana_reading : settingsCaps.katakana_reading;
  }

  // With no card seen yet the ideal run starts today, so "behind" would only mean "hasn't started" -- not shown.
  let vsIdeal: ProjectionSummary["vsIdeal"] = null;
  if (ideal && hasHistory) {
    const idealToday = ideal.cumulative[Math.min(todayIdx, ideal.cumulative.length - 1)];
    const cards = seen - idealToday;
    // Days are how far along the ideal curve today's total sits: the day the ideal first held `seen`
    // cards, measured from today. Only meaningful (and sign-consistent with `cards`) when they differ.
    const reached = ideal.cumulative.findIndex((v) => v >= seen);
    vsIdeal = { cards, days: cards === 0 ? 0 : reached === -1 ? null : todayIdx - reached };
  }

  const completionIdx = predicted?.completionIdx ?? null;
  return {
    days,
    startDay,
    hasHistory,
    todayIdx,
    actual: { perDay: actualPerDay, cumulative: actualCumulative },
    poolTotal,
    predicted,
    ideal,
    summary: {
      seen,
      poolTotal,
      recentAverage,
      settingsCapPerDay,
      completionDay: completionIdx == null ? null : addDays(startDay, completionIdx),
      daysLeft: completionIdx == null ? null : Math.max(0, completionIdx - todayIdx),
      vsIdeal,
    },
    targets,
    categories,
  };
}
