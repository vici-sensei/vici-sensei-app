"use client";

import { useMemo, useState } from "react";
import { FaArrowRotateLeft, FaChevronDown, FaChevronRight } from "react-icons/fa6";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { JLPT_LEVELS } from "@/lib/srs/constants";
import {
  KANA_CATEGORIES,
  RECENT_AVERAGE_DAYS,
  STANDARD_CATEGORIES,
  projectNewCards,
  type PaceSource,
  type PredictionStart,
  type Track,
} from "@/lib/study/newCardProjection";
import type { AsyncStatus, NewCardCategory, StudentDetail, StudentNewCardProgress } from "@/lib/types";
import { NewCardsChart, type ChartView } from "./NewCardsChart";

const numberFormatter = new Intl.NumberFormat();
const fmt = (value: number) => numberFormatter.format(Math.round(value));
const fmtDecimal = (value: number) => numberFormatter.format(Math.round(value * 10) / 10);
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });

// A prediction can run for years; the table starts with the first year and offers the rest on request.
const TABLE_ROW_LIMIT = 366;

type NewPaceKey = "settings" | "average" | "5" | "10" | "20" | "30" | "50";
type ReviewKey = "settings" | "20" | "50" | "100" | "150" | "200" | "none";

const VIEW_OPTIONS: { value: ChartView; label: string }[] = [
  { value: "cumulative", label: "Cumulative" },
  { value: "daily", label: "Per day" },
];
const START_OPTIONS: { value: PredictionStart; label: string }[] = [
  { value: "ideal", label: "Ideal from day 1" },
  { value: "today", label: "From today on" },
];

// What "Reset" returns the filters to. Track and levels come from the student, so they're derived per student below.
const DEFAULT_VIEW: ChartView = "cumulative";
const DEFAULT_START: PredictionStart = "ideal";
const DEFAULT_NEW_PACE: NewPaceKey = "settings";
const DEFAULT_REVIEW_KEY: ReviewKey = "settings";

function initialLevels(enabled: string[]): string[] {
  const levels = JLPT_LEVELS.filter((level) => enabled.includes(level));
  return levels.length > 0 ? levels : ["N5"];
}

function settingsPaceLabel(track: Track, caps: Record<NewCardCategory, number>): string {
  if (track === "standard") return `${caps.kanji}+${caps.vocabulary}/day`;
  const h = caps.hiragana_reading;
  const k = caps.katakana_reading;
  return h === k ? `${h}/day` : `${h} hiragana, ${k} katakana/day`;
}

function LevelChips({ value, onToggle }: { value: string[]; onToggle: (level: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {JLPT_LEVELS.map((level) => {
        const on = value.includes(level);
        return (
          <button
            key={level}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(level)}
            className={`cursor-pointer rounded-lg px-3.5 py-[7px] text-[0.8rem] font-bold ${
              on ? "bg-white/10 text-white" : "text-text-muted hover:text-white"
            }`}
          >
            {level}
          </button>
        );
      })}
    </div>
  );
}

function FilterRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted sm:w-40 sm:shrink-0 sm:pt-2">{label}</div>
      <div className="min-w-0">
        {children}
        {hint && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="font-semibold">{value}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

interface Props {
  student: StudentDetail | null;
  progress: StudentNewCardProgress | null;
  status: AsyncStatus;
  error: string | null;
}

export function NewCardsProgress({ student, progress, status, error }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">New cards progress</h2>
      <GlassCard>
        {status === "error" ? (
          <p className="text-sm text-accent-red">Couldn&apos;t load the new-card progress{error ? `: ${error}` : "."}</p>
        ) : !student || !progress ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <NewCardsProgressLoaded student={student} progress={progress} />
        )}
      </GlassCard>
    </section>
  );
}

function NewCardsProgressLoaded({ student, progress }: { student: StudentDetail; progress: StudentNewCardProgress }) {
  const defaultTrack: Track = student.study_track ?? "standard";
  const defaultLevels = useMemo(() => initialLevels(student.enabled_levels), [student.enabled_levels]);
  const [track, setTrack] = useState<Track>(defaultTrack);
  const [levels, setLevels] = useState<string[]>(defaultLevels);
  const [view, setView] = useState<ChartView>(DEFAULT_VIEW);
  const [start, setStart] = useState<PredictionStart>(DEFAULT_START);
  const [newPace, setNewPace] = useState<NewPaceKey>(DEFAULT_NEW_PACE);
  const [reviewKey, setReviewKey] = useState<ReviewKey>(DEFAULT_REVIEW_KEY);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);

  // `levels` is always kept in JLPT order, so comparing the joined lists is enough.
  const filtersAreDefault =
    track === defaultTrack &&
    levels.join() === defaultLevels.join() &&
    view === DEFAULT_VIEW &&
    start === DEFAULT_START &&
    newPace === DEFAULT_NEW_PACE &&
    reviewKey === DEFAULT_REVIEW_KEY;

  function resetFilters() {
    setTrack(defaultTrack);
    setLevels(defaultLevels);
    setView(DEFAULT_VIEW);
    setStart(DEFAULT_START);
    setNewPace(DEFAULT_NEW_PACE);
    setReviewKey(DEFAULT_REVIEW_KEY);
  }

  // At least one level always stays on -- with none there would be nothing to plot or predict.
  function toggleLevel(level: string) {
    setLevels((prev) => {
      const on = prev.includes(level);
      if (on && prev.length === 1) return prev;
      return JLPT_LEVELS.filter((l) => (l === level ? !on : prev.includes(l)));
    });
  }

  const settingsCaps = useMemo<Record<NewCardCategory, number>>(
    () => ({
      kanji: student.new_kanji_per_day ?? 0,
      vocabulary: student.new_vocab_per_day ?? 0,
      hiragana_reading: student.new_hiragana_per_day ?? 0,
      katakana_reading: student.new_katakana_per_day ?? 0,
    }),
    [student]
  );
  const pace: PaceSource = newPace === "settings" ? { kind: "settings" } : newPace === "average" ? { kind: "average" } : { kind: "fixed", perDay: Number(newPace) };
  const reviewCap = reviewKey === "settings" ? (student.max_reviews_per_day ?? null) : reviewKey === "none" ? null : Number(reviewKey);
  const accuracy = Math.min(1, Math.max(0, student.retention_rate ?? 1));

  const result = useMemo(
    () => projectNewCards({ track, levels, progress, settingsCaps, pace, reviewCap, accuracy, start }),
    // `pace` is rebuilt every render from `newPace`, so that key is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, levels, progress, settingsCaps, newPace, reviewCap, accuracy, start]
  );

  const seenByTrack = useMemo(() => {
    const sum = (categories: readonly NewCardCategory[]) =>
      progress.history.filter((row) => categories.includes(row.category)).reduce((total, row) => total + row.count, 0);
    return { standard: sum(STANDARD_CATEGORIES), kana: sum(KANA_CATEGORIES) };
  }, [progress]);
  const plotted = seenByTrack.standard + seenByTrack.kana;
  const missing = progress.counter_total - plotted;
  const otherTrack: Track = track === "standard" ? "kana" : "standard";
  const trackLabel = track === "standard" ? "Standard" : "Kana";

  const { summary, predicted, days, todayIdx, actual } = result;
  const complete = summary.poolTotal > 0 && summary.seen >= summary.poolTotal;
  const percent = summary.poolTotal > 0 ? Math.round((summary.seen / summary.poolTotal) * 100) : 0;

  const levelSummary = JLPT_LEVELS.filter((level) => levels.includes(level)).join("+");
  const paceSummary =
    newPace === "settings"
      ? `Student settings (${settingsPaceLabel(track, settingsCaps)})`
      : newPace === "average"
        ? `Recent average (${fmtDecimal(summary.recentAverage)}/day)`
        : `${newPace}/day`;
  const reviewSummary = reviewCap == null ? "No review limit" : `${fmt(reviewCap)} reviews/day`;
  const summaryLine = [
    track === "standard" ? "Standard" : "Kana",
    ...(track === "standard" ? [levelSummary] : []),
    view === "cumulative" ? "Cumulative" : "Per day",
    START_OPTIONS.find((o) => o.value === start)?.label,
    paceSummary,
    reviewSummary,
  ].join(" · ");

  let emptyMessage: string | null = null;
  if (summary.poolTotal === 0) emptyMessage = "There are no cards to learn for these filters.";
  else if (!predicted && newPace === "average") {
    emptyMessage = `The student hasn't seen any new cards in the last ${RECENT_AVERAGE_DAYS} days, so a prediction from their recent average isn't possible.`;
  } else if (!predicted) emptyMessage = "No daily new-card target is set for these filters, so there is nothing to predict.";
  else if (predicted.completionIdx == null) emptyMessage = "At this pace the last new card isn't reached within 5 years.";

  const finishLabel = start === "ideal" ? "Ideal finish" : "Estimated finish";
  let finishValue = "—";
  let finishSub: string | undefined;
  if (complete) finishValue = "Finished";
  else if (summary.completionDay) {
    finishValue = dateFormatter.format(new Date(summary.completionDay));
    finishSub = summary.daysLeft === 0 ? "today" : `in ${fmt(summary.daysLeft ?? 0)} day${summary.daysLeft === 1 ? "" : "s"}`;
  } else if (predicted) finishValue = "Not within 5 years";

  let vsValue = "—";
  let vsSub: string | undefined;
  if (complete) vsValue = "Finished";
  else if (summary.vsIdeal) {
    const { cards, days: dayDiff } = summary.vsIdeal;
    if (cards === 0) vsValue = "On track";
    else {
      vsValue = `${cards > 0 ? "+" : "−"}${fmt(Math.abs(cards))} cards`;
      if (dayDiff != null && dayDiff !== 0) vsSub = `about ${fmt(Math.abs(dayDiff))} day${Math.abs(dayDiff) === 1 ? "" : "s"} ${dayDiff > 0 ? "behind" : "ahead"}`;
    }
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg text-left"
        >
          <span className="flex h-5 items-center text-text-muted">{filtersOpen ? <FaChevronDown /> : <FaChevronRight />}</span>
          <span className="text-sm font-bold leading-5">Filters</span>
          {/* The panel below shows the same values, so the summary only appears while it's closed. */}
          {!filtersOpen && <span className="min-w-0 flex-1 pt-0.5 text-xs leading-4 text-text-muted/70">{summaryLine}</span>}
        </button>
        {/* Hidden rather than removed at the defaults, so the summary doesn't reflow when it appears. */}
        <button
          type="button"
          onClick={resetFilters}
          className={`flex h-5 shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-white ${
            filtersAreDefault ? "invisible" : ""
          }`}
        >
          <FaArrowRotateLeft aria-hidden />
          Reset
        </button>
      </div>

      <Collapsible open={filtersOpen} openClassName="mt-4">
        <div className="flex flex-col gap-4 border-t border-border-soft pt-4">
          <FilterRow label="Study track">
            <PillSelector
              variant="compact"
              active={track}
              onChange={setTrack}
              options={[
                { value: "standard", label: `Standard (${fmt(seenByTrack.standard)})` },
                { value: "kana", label: `Kana (${fmt(seenByTrack.kana)})` },
              ]}
            />
          </FilterRow>
          {track === "standard" && (
            <FilterRow label="JLPT levels">
              <LevelChips value={levels} onToggle={toggleLevel} />
            </FilterRow>
          )}
          <FilterRow label="Chart shows">
            <PillSelector variant="compact" active={view} onChange={setView} options={VIEW_OPTIONS} />
          </FilterRow>
          <FilterRow label="Prediction">
            <PillSelector variant="compact" active={start} onChange={setStart} options={START_OPTIONS} />
          </FilterRow>
          <FilterRow
            label="New cards per day"
            hint={
              track === "kana"
                ? "Applies to the script being learned: hiragana first, then katakana."
                : "Fixed values are a kanji + vocabulary total, split the way the student's own settings split it."
            }
          >
            <PillSelector
              variant="compact"
              active={newPace}
              onChange={setNewPace}
              options={[
                { value: "settings", label: "Student settings" },
                { value: "average", label: "Recent average" },
                { value: "5", label: "5" },
                { value: "10", label: "10" },
                { value: "20", label: "20" },
                { value: "30", label: "30" },
                { value: "50", label: "50" },
              ]}
            />
          </FilterRow>
          <FilterRow
            label="Max reviews per day"
            hint="Counts reviews of already-learned cards only. On a day the reviews due reach this number, the prediction adds no new cards."
          >
            <PillSelector
              variant="compact"
              active={reviewKey}
              onChange={setReviewKey}
              options={[
                { value: "settings", label: "Student settings" },
                { value: "20", label: "20" },
                { value: "50", label: "50" },
                { value: "100", label: "100" },
                { value: "150", label: "150" },
                { value: "200", label: "200" },
                { value: "none", label: "No limit" },
              ]}
            />
          </FilterRow>
        </div>
      </Collapsible>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
        <Stat label="Cards seen" value={`${fmt(summary.seen)} of ${fmt(summary.poolTotal)}`} sub={summary.poolTotal > 0 ? `${percent}%` : undefined} />
        <Stat label={finishLabel} value={finishValue} sub={finishSub} />
        <Stat label="Vs. ideal today" value={vsValue} sub={vsSub} />
        <Stat
          label={`Pace, last ${RECENT_AVERAGE_DAYS} days`}
          value={`${fmtDecimal(summary.recentAverage)}/day`}
          sub={`student set ${fmt(summary.settingsCapPerDay)}/day`}
        />
      </div>

      <div className="mt-5">
        <NewCardsChart
          result={result}
          view={view}
          start={start}
          track={track}
          tests={progress.tests}
          reviewCap={reviewCap}
        />
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs text-text-muted">
        {emptyMessage && <p>{emptyMessage}</p>}
        {result.hasHistory ? (
          <p>
            Starts on {dateFormatter.format(new Date(result.startDay))}, the day the first {trackLabel} card was seen.
          </p>
        ) : (
          <p>
            No cards seen on the {trackLabel} track yet, so the chart starts today.
            {seenByTrack[otherTrack] > 0 && ` This student has ${fmt(seenByTrack[otherTrack])} on the ${otherTrack === "standard" ? "Standard" : "Kana"} track.`}
          </p>
        )}
        {missing > 0 && (
          <p>
            {fmt(missing)} new card{missing === 1 ? "" : "s"} this student saw {missing === 1 ? "was" : "were"} later undone or deleted, so{" "}
            {missing === 1 ? "it" : "they"} can&apos;t be plotted.
          </p>
        )}
        <p>The prediction assumes the student keeps the settings above and answers with their recent accuracy; it is an estimate, not the app&apos;s behaviour.</p>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((open) => !open)}
        aria-expanded={showTable}
        className="mt-3 cursor-pointer text-xs font-semibold text-text-muted hover:text-white"
      >
        {showTable ? "Hide table" : "Show table"}
      </button>
      {showTable && (
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full min-w-120 text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft text-text-muted">
                <th className="px-2 py-2 font-semibold">Date</th>
                <th className="px-2 py-2 font-semibold">Real</th>
                <th className="px-2 py-2 font-semibold">Real total</th>
                <th className="px-2 py-2 font-semibold">Predicted</th>
                <th className="px-2 py-2 font-semibold">Predicted total</th>
                <th className="px-2 py-2 font-semibold">Reviews due</th>
              </tr>
            </thead>
            <tbody>
              {days.slice(0, showAllRows ? undefined : TABLE_ROW_LIMIT).map((day, i) => {
                const hasReal = i <= todayIdx;
                const hasPredicted = predicted != null && (start === "ideal" || i > todayIdx);
                return (
                  <tr key={day} className="border-b border-border-soft/50">
                    <td className="px-2 py-1.5">{dateFormatter.format(new Date(day))}</td>
                    <td className="px-2 py-1.5">{hasReal ? fmt(actual.perDay[i]) : "—"}</td>
                    <td className="px-2 py-1.5 text-text-muted">{hasReal ? fmt(actual.cumulative[i]) : "—"}</td>
                    <td className="px-2 py-1.5">{hasPredicted ? fmt(predicted.perDay[i] ?? 0) : "—"}</td>
                    <td className="px-2 py-1.5 text-text-muted">
                      {hasPredicted ? fmt(predicted.cumulative[Math.min(i, predicted.cumulative.length - 1)]) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-text-muted">{hasPredicted && i < predicted.due.length ? fmt(predicted.due[i]) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {days.length > TABLE_ROW_LIMIT && !showAllRows && (
            <button type="button" onClick={() => setShowAllRows(true)} className="my-2 cursor-pointer px-2 text-xs font-semibold text-text-muted hover:text-white">
              Showing the first {TABLE_ROW_LIMIT} of {fmt(days.length)} days. Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
