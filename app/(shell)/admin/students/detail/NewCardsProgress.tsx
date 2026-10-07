"use client";

import { useMemo, useState } from "react";
import { FaArrowRotateLeft, FaChevronDown, FaChevronRight, FaMinus, FaPlus } from "react-icons/fa6";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { stepperButtonClass } from "@/app/components/ui/Stepper";
import { JLPT_LEVELS } from "@/lib/srs/constants";
import {
  KANA_CATEGORIES,
  KANA_TEST_PAUSE_DAYS,
  RECENT_AVERAGE_DAYS,
  STANDARD_CATEGORIES,
  projectNewCards,
  type CategoryPace,
  type PaceSource,
  type PredictionStart,
  type ProjectionResult,
  type Track,
} from "@/lib/study/newCardProjection";
import type { AsyncStatus, NewCardCategory, StudentDetail, StudentNewCardProgress } from "@/lib/types";
import { NewCardsChart, type ChartView } from "./NewCardsChart";

const numberFormatter = new Intl.NumberFormat();
const fmt = (value: number) => numberFormatter.format(Math.round(value));
const fmtDecimal = (value: number) => numberFormatter.format(Math.round(value * 10) / 10);
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" });
const listFormatter = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

// A prediction can run for years; the table starts with the first year and offers the rest on request.
const TABLE_ROW_LIMIT = 366;

type PaceMode = "settings" | "average" | "custom";
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
const DEFAULT_START: PredictionStart = "today";
const DEFAULT_PACE_MODE: PaceMode = "settings";

const PACE_OPTIONS: { value: PaceMode; label: string }[] = [
  { value: "settings", label: "Student settings" },
  { value: "average", label: "Recent average" },
  { value: "custom", label: "Custom" },
];
// Same lock the app keeps between the two limits (sync_new_vocab_per_day_trigger): 6 new words per kanji.
const VOCAB_PER_KANJI = 6;
const MAX_CUSTOM_PER_DAY = 999;

const clampPerDay = (n: number, max = MAX_CUSTOM_PER_DAY) => Math.min(Math.max(1, max), Math.max(1, Math.round(n)));

function toCategoryPace(mode: PaceMode, custom: number): CategoryPace {
  if (mode === "settings") return { kind: "settings" };
  if (mode === "average") return { kind: "average" };
  return { kind: "fixed", perDay: custom };
}
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

/** −/value/+ with a typeable value: the draft is only applied (and normalized by the caller, e.g.
 * rounded to a multiple of 6) on Enter or when the field loses focus, so typing "2" on the way to
 * "20" doesn't jump around. */
function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = Number(draft);
    setDraft(null);
    if (draft !== "" && Number.isFinite(n)) onChange(n);
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        className={stepperButtonClass}
        disabled={value - step < min}
        onClick={() => onChange(value - step)}
      >
        <FaMinus />
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        className="h-9 w-16 rounded-lg border border-border-soft bg-white/[0.04] text-center text-[0.95rem] font-extrabold tabular-nums text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        aria-label={`More ${label}`}
        className={stepperButtonClass}
        disabled={value + step > max}
        onClick={() => onChange(value + step)}
      >
        <FaPlus />
      </button>
    </div>
  );
}

/** A pace row: Student settings / Recent average / Custom, plus the number field while Custom is on. */
function PaceControl({
  mode,
  onModeChange,
  custom,
  field,
}: {
  mode: PaceMode;
  onModeChange: (mode: PaceMode) => void;
  custom: number;
  field: { label: string; step: number; min: number; max: number; onChange: (value: number) => void };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PillSelector variant="compact" active={mode} onChange={onModeChange} options={PACE_OPTIONS} />
      {mode === "custom" && <NumberField value={custom} {...field} />}
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

const PACE_ORIGIN: Record<PaceMode, string> = {
  settings: "from the student's settings",
  average: `the student's real average over the last ${RECENT_AVERAGE_DAYS} days`,
  custom: "custom, set in the filters",
};

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-white">{children}</strong>;
}

/** The chart in plain words, with the exact filter values spelled out -- read straight from the same
 * state the chart is drawn from, so it can't drift from what's on screen. */
function ChartExplanation({
  result,
  track,
  levels,
  view,
  start,
  modes,
  reviewCap,
  reviewFromSettings,
}: {
  result: ProjectionResult;
  track: Track;
  levels: string[];
  view: ChartView;
  start: PredictionStart;
  modes: { standard: PaceMode; hiragana: PaceMode; katakana: PaceMode };
  reviewCap: number | null;
  reviewFromSettings: boolean;
}) {
  const { predicted, targets, summary, days, todayIdx } = result;
  const cards = track === "standard" ? "kanji and vocabulary" : "hiragana and katakana";
  // Same test the chart uses for drawing the dashed line: it needs at least two points.
  const showsPrediction = predicted != null && days.length - (start === "today" ? todayIdx : 0) > 1;

  const pace =
    track === "standard" ? (
      <>
        <Strong>{fmtDecimal(targets.kanji ?? 0)} new kanji</Strong> and <Strong>{fmtDecimal(targets.vocabulary ?? 0)} new vocabulary words</Strong> a day (
        {PACE_ORIGIN[modes.standard]})
      </>
    ) : (
      <>
        <Strong>{fmtDecimal(targets.hiragana_reading ?? 0)} new hiragana</Strong> a day
        {modes.hiragana === modes.katakana ? "" : ` (${PACE_ORIGIN[modes.hiragana]})`}, then{" "}
        <Strong>{fmtDecimal(targets.katakana_reading ?? 0)} new katakana</Strong> a day ({PACE_ORIGIN[modes.katakana]})
      </>
    );

  return (
    <div className="mt-4 flex flex-col gap-1.5 text-sm leading-relaxed text-text-main/90">
      <p>
        {view === "cumulative" ? (
          <>
            This chart shows the <Strong>running total</Strong> of new {cards} cards the student has learned, day by day
          </>
        ) : (
          <>
            This chart shows <Strong>how many</Strong> new {cards} cards the student started <Strong>on each day</Strong>
          </>
        )}
        {track === "standard" && (
          <>
            , for the JLPT {levels.length === 1 ? "level" : "levels"} <Strong>{listFormatter.format(levels)}</Strong>
          </>
        )}
        {summary.poolTotal > 0 && (
          <>
            , out of <Strong>{fmt(summary.poolTotal)}</Strong> cards to learn in all
          </>
        )}
        .
      </p>
      <p>
        <span className="font-semibold text-accent-red">The red line</span> is what the student really did, up to today:{" "}
        <Strong>{fmt(summary.seen)}</Strong> card{summary.seen === 1 ? "" : "s"} seen in total.
      </p>
      {showsPrediction && (
        <p>
          <span className="font-semibold text-accent-blue">The blue dashed line</span>{" "}
          {start === "today" ? (
            <>is a prediction that starts from today&apos;s real total and carries on at {pace}.</>
          ) : (
            <>
              is an ideal run: how it would look if the student had followed {pace} <Strong>from the very first day</Strong>, ignoring what they really did.
            </>
          )}{" "}
          {track === "kana" && (
            <>Katakana starts {KANA_TEST_PAUSE_DAYS} days after the last hiragana card, standing in for the hiragana reading test. </>
          )}
          {reviewCap == null ? (
            <>It puts no limit on daily reviews, so new cards are never paused.</>
          ) : (
            <>
              It also limits reviews of already-learned cards to <Strong>{fmt(reviewCap)} a day</Strong>
              {reviewFromSettings ? " (the student's own limit)" : ""}: on a day when that many reviews are due, no new cards are added.
            </>
          )}
        </p>
      )}
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
  // Standard: kanji and vocabulary always share one mode, and a custom vocabulary pace is always
  // VOCAB_PER_KANJI x the custom kanji pace -- the same 1:6 lock the app itself keeps. Kana: the
  // two scripts are independent, like their own settings.
  const defaultCustomKanji = clampPerDay(student.new_kanji_per_day || 1);
  const defaultCustomHiragana = clampPerDay(student.new_hiragana_per_day || 5);
  const defaultCustomKatakana = clampPerDay(student.new_katakana_per_day || 5);
  const [standardMode, setStandardMode] = useState<PaceMode>(DEFAULT_PACE_MODE);
  const [customKanji, setCustomKanji] = useState(defaultCustomKanji);
  const [hiraganaMode, setHiraganaMode] = useState<PaceMode>(DEFAULT_PACE_MODE);
  const [customHiragana, setCustomHiragana] = useState(defaultCustomHiragana);
  const [katakanaMode, setKatakanaMode] = useState<PaceMode>(DEFAULT_PACE_MODE);
  const [customKatakana, setCustomKatakana] = useState(defaultCustomKatakana);
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
    standardMode === DEFAULT_PACE_MODE &&
    hiraganaMode === DEFAULT_PACE_MODE &&
    katakanaMode === DEFAULT_PACE_MODE &&
    reviewKey === DEFAULT_REVIEW_KEY;

  function resetFilters() {
    setTrack(defaultTrack);
    setLevels(defaultLevels);
    setView(DEFAULT_VIEW);
    setStart(DEFAULT_START);
    setStandardMode(DEFAULT_PACE_MODE);
    setCustomKanji(defaultCustomKanji);
    setHiraganaMode(DEFAULT_PACE_MODE);
    setCustomHiragana(defaultCustomHiragana);
    setKatakanaMode(DEFAULT_PACE_MODE);
    setCustomKatakana(defaultCustomKatakana);
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
  // Custom paces can't go past how much there is to learn: kanji and vocabulary at the levels ticked
  // above (held to 1:6 the same way get_new_card_caps_for_levels holds the student's own settings),
  // hiragana/katakana at their whole script. A value that no longer fits after unticking a level is
  // shown and used at the new maximum; ticking the level again brings the typed value back.
  const customCaps = useMemo(() => {
    const total = (category: NewCardCategory, atLevels: boolean) =>
      progress.pool
        .filter((row) => row.category === category && (!atLevels || (row.level != null && levels.includes(row.level))))
        .reduce((sum, row) => sum + row.total, 0);
    const kanji = Math.max(1, Math.min(total("kanji", true), Math.floor(total("vocabulary", true) / VOCAB_PER_KANJI)));
    return {
      kanji,
      vocabulary: kanji * VOCAB_PER_KANJI,
      hiragana: Math.max(1, total("hiragana_reading", false)),
      katakana: Math.max(1, total("katakana_reading", false)),
    };
  }, [progress, levels]);
  const kanjiPace = Math.min(customKanji, customCaps.kanji);
  const hiraganaPace = Math.min(customHiragana, customCaps.hiragana);
  const katakanaPace = Math.min(customKatakana, customCaps.katakana);
  const customVocabulary = kanjiPace * VOCAB_PER_KANJI;
  const pace: PaceSource = useMemo(
    () =>
      track === "standard"
        ? {
            kanji: toCategoryPace(standardMode, kanjiPace),
            vocabulary: toCategoryPace(standardMode, kanjiPace * VOCAB_PER_KANJI),
          }
        : {
            hiragana_reading: toCategoryPace(hiraganaMode, hiraganaPace),
            katakana_reading: toCategoryPace(katakanaMode, katakanaPace),
          },
    [track, standardMode, kanjiPace, hiraganaMode, hiraganaPace, katakanaMode, katakanaPace]
  );
  const reviewCap = reviewKey === "settings" ? (student.max_reviews_per_day ?? null) : reviewKey === "none" ? null : Number(reviewKey);
  const accuracy = Math.min(1, Math.max(0, student.retention_rate ?? 1));

  const result = useMemo(
    () => projectNewCards({ track, levels, progress, settingsCaps, pace, reviewCap, accuracy, start }),
    [track, levels, progress, settingsCaps, pace, reviewCap, accuracy, start]
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
  const kanaPaceLabel = (script: string, mode: PaceMode, custom: number) =>
    `${script} ${mode === "settings" ? "from settings" : mode === "average" ? "at recent average" : `${fmt(custom)}/day`}`;
  const paceSummary =
    track === "standard"
      ? standardMode === "settings"
        ? `Student settings (${settingsPaceLabel(track, settingsCaps)})`
        : standardMode === "average"
          ? `Recent average (${fmtDecimal(summary.recentAverage)}/day)`
          : `${fmt(kanjiPace)} kanji + ${fmt(customVocabulary)} vocabulary/day`
      : hiraganaMode === "settings" && katakanaMode === "settings"
        ? `Student settings (${settingsPaceLabel(track, settingsCaps)})`
        : [kanaPaceLabel("Hiragana", hiraganaMode, hiraganaPace), kanaPaceLabel("katakana", katakanaMode, katakanaPace)].join(", ");
  const usesAverage = track === "standard" ? standardMode === "average" : hiraganaMode === "average" || katakanaMode === "average";
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
  else if (!predicted && usesAverage) {
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
          {track === "standard" ? (
            <>
              <FilterRow label="New kanji per day">
                <PaceControl
                  mode={standardMode}
                  onModeChange={setStandardMode}
                  custom={kanjiPace}
                  field={{
                    label: "kanji per day",
                    step: 1,
                    min: 1,
                    max: customCaps.kanji,
                    onChange: (n) => setCustomKanji(clampPerDay(n, customCaps.kanji)),
                  }}
                />
              </FilterRow>
              <FilterRow
                label="New vocabulary per day"
                hint={`Always ${VOCAB_PER_KANJI} words per kanji, like in the app: changing one changes the other, and any number is rounded to a multiple of ${VOCAB_PER_KANJI}. Custom goes up to ${fmt(customCaps.kanji)} kanji / ${fmt(customCaps.vocabulary)} words, what the ticked levels hold.`}
              >
                <PaceControl
                  mode={standardMode}
                  onModeChange={setStandardMode}
                  custom={customVocabulary}
                  field={{
                    label: "words per day",
                    step: VOCAB_PER_KANJI,
                    min: VOCAB_PER_KANJI,
                    max: customCaps.vocabulary,
                    onChange: (n) => setCustomKanji(clampPerDay(n / VOCAB_PER_KANJI, customCaps.kanji)),
                  }}
                />
              </FilterRow>
            </>
          ) : (
            <>
              <FilterRow label="New hiragana per day">
                <PaceControl
                  mode={hiraganaMode}
                  onModeChange={setHiraganaMode}
                  custom={hiraganaPace}
                  field={{
                    label: "hiragana per day",
                    step: 1,
                    min: 1,
                    max: customCaps.hiragana,
                    onChange: (n) => setCustomHiragana(clampPerDay(n, customCaps.hiragana)),
                  }}
                />
              </FilterRow>
              <FilterRow
                label="New katakana per day"
                hint="Hiragana is learned first, then katakana. Recent average is the pace of whichever script the student was on."
              >
                <PaceControl
                  mode={katakanaMode}
                  onModeChange={setKatakanaMode}
                  custom={katakanaPace}
                  field={{
                    label: "katakana per day",
                    step: 1,
                    min: 1,
                    max: customCaps.katakana,
                    onChange: (n) => setCustomKatakana(clampPerDay(n, customCaps.katakana)),
                  }}
                />
              </FilterRow>
            </>
          )}
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

      <ChartExplanation
        result={result}
        track={track}
        levels={levels}
        view={view}
        start={start}
        modes={{ standard: standardMode, hiragana: hiraganaMode, katakana: katakanaMode }}
        reviewCap={reviewCap}
        reviewFromSettings={reviewKey === "settings"}
      />

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
