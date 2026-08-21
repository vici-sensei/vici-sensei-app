"use client";

import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { prefetchProgressSummary } from "@/lib/client-data/progress";
import { cardsRemainingToday } from "@/lib/study/stats";
import { useInView } from "@/lib/useInView";
import { useCountUp } from "@/lib/useCountUp";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { AnimatedRingStroke, RingTrack } from "@/app/components/ui/AnimatedRing";
import { DashboardHero } from "./DashboardHero";
import { NextCardCountdown } from "./NextCardCountdown";
import { CheckoutBanner } from "./CheckoutBanner";
import { WeekStreak } from "./WeekStreak";
import { LevelProgressCard } from "./LevelProgressCard";
import { FaBook, FaFire, FaArrowRight, FaArrowsRotate } from "react-icons/fa6";
import type { WeeklyActivityDay } from "@/lib/types";

// mingcute:target-fill (https://icon-sets.iconify.design/mingcute/target-fill) -- react-icons
// doesn't bundle the MingCute set, so inlined as a one-off rather than pulling in a whole new
// icon-set dependency for a single icon.
function TargetFillIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10s10-4.477 10-10c0-.895-.12-1.763-.34-2.589l-2.124 2.124a3 3 0 0 1-.537.422L19 12a7 7 0 1 1-7-7l.043.001c.12-.192.259-.374.422-.537l2.124-2.124C13.763 2.12 12.895 2 12 2m-.414 5.018a5 5 0 1 0 5.395 5.396h-2.395q-.084 0-.167-.005l-.54.54a2 2 0 0 1-2.828-2.828l.54-.54a3 3 0 0 1-.005-.167zm6.918-4.892a1 1 0 0 0-1.09.217L13.88 5.879a1 1 0 0 0-.293.707V9l-1.83 1.828a1 1 0 0 0 1.416 1.414L15 10.414h2.414a1 1 0 0 0 .707-.293l3.535-3.535a1 1 0 0 0-.707-1.707h-1.828v-1.83a1 1 0 0 0-.617-.923" />
    </svg>
  );
}

function CheckoutBannerFromQuery() {
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  if (checkout !== "success" && checkout !== "cancel") return null;
  return <CheckoutBanner status={checkout} />;
}

// Placeholder week -- all flames unlit, so today reads as the same faded red WeekStreak
// already uses for "today, not done yet" -- shown in place of a skeleton while stats load.
function placeholderWeekActivity(): WeeklyActivityDay[] {
  const days: WeeklyActivityDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), active: false });
  }
  return days;
}

function StreakCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();
  const streak = stats?.streak ?? 0;
  const displayedStreak = useCountUp(streak);
  const activity = stats?.weekly_activity ?? placeholderWeekActivity();
  const todayDone = stats ? cardsRemainingToday(stats) === 0 : false;

  return (
    <GlassCard padding="sm">
      <div className="flex flex-col gap-2 sm:gap-6 text-center sm:flex-row sm:flex-wrap sm:text-left justify-center items-center h-full">
        <div className="flex items-center gap-3.5">
          <div className="flex flex-col items-center sm:gap-2">
            <div className="text-3xl font-extrabold leading-none tracking-tight text-accent-gold">{displayedStreak}</div>
            <div className="text-sm font-semibold text-text-muted">Day streak</div>
          </div>
        </div>
        <WeekStreak activity={activity} streak={streak} todayDone={todayDone} />
      </div>
    </GlassCard>
  );
}

const RING_SIZE = 56;
const RING_STROKE = 4;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = RING_CENTER - RING_STROKE / 2 - 2;

function statPct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function StatRing({
  icon,
  percent,
  colorClass,
}: {
  icon: React.ReactNode;
  percent: number;
  colorClass: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="relative mb-3.5 h-14 w-14 shrink-0">
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="h-full w-full -rotate-90">
        <RingTrack cx={RING_CENTER} cy={RING_CENTER} radius={RING_RADIUS} strokeWidth={RING_STROKE} />
        <AnimatedRingStroke
          cx={RING_CENTER}
          cy={RING_CENTER}
          radius={RING_RADIUS}
          strokeWidth={RING_STROKE}
          percent={percent}
          inView={inView}
          className={colorClass}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center ${colorClass.replace("stroke-", "text-")}`}>
        {icon}
      </div>
    </div>
  );
}

// Matches DEFAULT_NEW_KANJI_PER_DAY in lib/data/studyStats.ts (and the
// user_study_settings.new_kanji_per_day column default) -- shown before the
// user's real per-day limit has loaded.
const FALLBACK_NEW_KANJI_LIMIT = 1;

function NewKanjiCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here. The daily limit is per-user, so the real value can't be known
  // before stats load; shown as 0/1 until then instead of a skeleton.
  const { stats } = useStudyStats();
  const kanjiToday = stats?.new_kanji_today ?? 0;
  const kanjiLimit = stats?.new_kanji_limit ?? FALLBACK_NEW_KANJI_LIMIT;

  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing
        icon={<span className="text-[27px] font-medium leading-none">竜</span>}
        percent={statPct(kanjiToday, kanjiLimit)}
        colorClass="stroke-accent-blue"
      />
      <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
        {kanjiToday}
        <span className="text-[1.1rem] text-text-muted">/{kanjiLimit}</span>
      </div>
      <div className="text-sm font-semibold text-text-muted">New kanji today</div>
    </GlassCard>
  );
}

// Matches DEFAULT_NEW_VOCAB_PER_DAY in lib/data/studyStats.ts (and the
// user_study_settings.new_vocab_per_day column default) -- shown before the
// user's real per-day limit has loaded.
const FALLBACK_NEW_VOCAB_LIMIT = 6;

function NewVocabCard() {
  const { stats } = useStudyStats();
  const vocabToday = stats?.new_vocab_today ?? 0;
  const vocabLimit = stats?.new_vocab_limit ?? FALLBACK_NEW_VOCAB_LIMIT;

  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing
        icon={<FaBook className="h-6 w-6" />}
        percent={statPct(vocabToday, vocabLimit)}
        colorClass="stroke-accent-violet"
      />
      <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
        {vocabToday}
        <span className="text-[1.1rem] text-text-muted">/{vocabLimit}</span>
      </div>
      <div className="text-sm font-semibold text-text-muted">New vocab today</div>
    </GlassCard>
  );
}

// Matches the new_hiragana_per_day/new_katakana_per_day column defaults (5) --
// shown before the user's real per-day limit has loaded.
const FALLBACK_NEW_HIRAGANA_LIMIT = 5;
const FALLBACK_NEW_KATAKANA_LIMIT = 5;

function NewHiraganaCard() {
  const { stats } = useStudyStats();
  const hiraganaToday = stats?.new_hiragana_today ?? 0;
  const hiraganaLimit = stats?.new_hiragana_limit ?? FALLBACK_NEW_HIRAGANA_LIMIT;

  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing
        icon={<span className="text-[27px] font-medium leading-none">あ</span>}
        percent={statPct(hiraganaToday, hiraganaLimit)}
        colorClass="stroke-accent-blue"
      />
      <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
        {hiraganaToday}
        <span className="text-[1.1rem] text-text-muted">/{hiraganaLimit}</span>
      </div>
      <div className="text-sm font-semibold text-text-muted">New hiragana today</div>
    </GlassCard>
  );
}

function NewKatakanaCard() {
  const { stats } = useStudyStats();
  const katakanaToday = stats?.new_katakana_today ?? 0;
  const katakanaLimit = stats?.new_katakana_limit ?? FALLBACK_NEW_KATAKANA_LIMIT;

  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing
        icon={<span className="text-[27px] font-medium leading-none">ア</span>}
        percent={statPct(katakanaToday, katakanaLimit)}
        colorClass="stroke-accent-violet"
      />
      <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
        {katakanaToday}
        <span className="text-[1.1rem] text-text-muted">/{katakanaLimit}</span>
      </div>
      <div className="text-sm font-semibold text-text-muted">New katakana today</div>
    </GlassCard>
  );
}

function ReviewsTodayCard() {
  // Reviews have no per-user daily target -- the denominator is just what's
  // actually due, so 0/0 is the honest pre-load state (not a guessed fallback).
  const { stats, clockOffsetMs, refresh } = useStudyStats();
  const reviewedToday = stats?.reviewed_today ?? 0;
  const dueToday = stats?.due_today ?? 0;

  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing
        icon={<FaArrowsRotate className="h-7 w-7" />}
        percent={statPct(reviewedToday, reviewedToday + dueToday)}
        colorClass="stroke-accent-orange"
      />
      <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
        {reviewedToday}
        <span className="text-[1.1rem] text-text-muted">/{reviewedToday + dueToday}</span>
      </div>
      <div className="text-sm font-semibold text-text-muted">Reviews done today</div>
      {stats && stats.next_due_is_today && stats.next_due_at && (
        <div className="mt-1 text-[0.7rem] font-semibold text-accent-gold">
          Next card <NextCardCountdown dueAt={stats.next_due_at} clockOffsetMs={clockOffsetMs} onElapsed={refresh} />
        </div>
      )}
    </GlassCard>
  );
}

function AccuracyCard() {
  // No accuracy data yet before stats load -- shown as a real-looking 0%
  // rather than the muted "N/A" reserved for "loaded, but no reviews ever".
  const { stats } = useStudyStats();
  const hasRetention = stats?.retention_rate != null;
  const retentionPct = hasRetention ? Math.round(stats!.retention_rate! * 100) : 0;

  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing icon={<TargetFillIcon className="h-8 w-8" />} percent={retentionPct} colorClass="stroke-accent-red" />
      <div
        className={
          !stats || hasRetention
            ? "mb-1.5 text-3xl font-extrabold leading-none tracking-tight"
            : "mb-1.5 text-3xl font-semibold leading-none tracking-tight text-text-muted"
        }
      >
        {!stats ? "0%" : hasRetention ? `${retentionPct}%` : "N/A"}
      </div>
      <div className="text-sm font-semibold text-text-muted">Accuracy (30d)</div>
    </GlassCard>
  );
}

// Grid coordinates for each dashboard card: row/col it starts at + how many
// columns/rows it spans, on a 12-column grid (12 splits evenly into the 4 stat cards,
// unlike 6). Add an xs/sm/md/lg tier to move a card at that breakpoint
// (280/480/768/992px) -- properties you don't set there just keep the previous tier's
// value (see .grid-item in globals.css). This object is the only thing you need to
// edit to rearrange the dashboard.
type Placement = { row?: number; col?: number; colSpan?: number; rowSpan?: number };
type ResponsivePlacement = { base: Placement; xs?: Placement; sm?: Placement; md?: Placement; lg?: Placement };

const LAYOUT: Record<
  "hero" | "streak" | "level" | "statKanji" | "statVocab" | "statReviews" | "statAccuracy",
  ResponsivePlacement
> = {
  // Hero + Streak: stacked (each full width) below "md" (768px); paired on one row,
  // 8/4 split, from "md" up.
  hero: { base: { row: 1, col: 1, colSpan: 12 }, md: { row: 1, col: 1, colSpan: 8 } },

  streak: { base: { row: 2, col: 1, colSpan: 12 }, md: { row: 1, col: 9, colSpan: 4 } },

  // Stat cards: full width, each on its own row, below "xs" (280px); 2x2 from "xs" up;
  // one row of 4 from "sm" up. "md" only moves them up a row, since Hero+Streak now
  // share row 1 instead of taking rows 1-2.
  statKanji: {
    base: { row: 3, col: 1, colSpan: 12 },
    xs: { row: 3, col: 1, colSpan: 6 },
    sm: { row: 3, col: 1, colSpan: 3 },
    md: { row: 2 },
  },

  statVocab: {
    base: { row: 4, col: 1, colSpan: 12 },
    xs: { row: 3, col: 7, colSpan: 6 },
    sm: { row: 3, col: 4, colSpan: 3 },
    md: { row: 2 },
  },

  statReviews: {
    base: { row: 5, col: 1, colSpan: 12 },
    xs: { row: 4, col: 1, colSpan: 6 },
    sm: { row: 3, col: 7, colSpan: 3 },
    md: { row: 2 },
  },

  statAccuracy: {
    base: { row: 6, col: 1, colSpan: 12 },
    xs: { row: 4, col: 7, colSpan: 6 },
    sm: { row: 3, col: 10, colSpan: 3 },
    md: { row: 2 },
  },

  // Always the last row, full width, at every breakpoint.
  level: {
    base: { row: 7, col: 1, colSpan: 12 },
    xs: { row: 5, col: 1, colSpan: 12 },
    sm: { row: 4, col: 1, colSpan: 12 },
    md: { row: 3 },
  },
};

function gridArea({ base, xs, sm, md, lg }: ResponsivePlacement): CSSProperties {
  const vars: Record<string, number> = {};
  const set = (suffix: string, p?: Placement) => {
    if (!p) return;
    if (p.row !== undefined) vars[`--row${suffix}`] = p.row;
    if (p.col !== undefined) vars[`--col${suffix}`] = p.col;
    if (p.colSpan !== undefined) vars[`--col-span${suffix}`] = p.colSpan;
    if (p.rowSpan !== undefined) vars[`--row-span${suffix}`] = p.rowSpan;
  };
  set("", base);
  set("-xs", xs);
  set("-sm", sm);
  set("-md", md);
  set("-lg", lg);
  return vars as CSSProperties;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { stats } = useStudyStats();
  const isKana = stats?.study_track === "kana";

  function handleProgressIntent() {
    if (user) prefetchProgressSummary(user.id);
  }

  return (
    <div>
      <Suspense fallback={null}>
        <CheckoutBannerFromQuery />
      </Suspense>

      <div className="grid grid-cols-12 gap-5">
        <div className="grid-item" style={gridArea(LAYOUT.hero)}>
          <DashboardHero />
        </div>
        <div className="grid-item" style={gridArea(LAYOUT.streak)}>
          <StreakCard />
        </div>
        <div className="grid-item" style={gridArea(LAYOUT.statKanji)}>
          {isKana ? <NewHiraganaCard /> : <NewKanjiCard />}
        </div>
        <div className="grid-item" style={gridArea(LAYOUT.statVocab)}>
          {isKana ? <NewKatakanaCard /> : <NewVocabCard />}
        </div>
        <div className="grid-item" style={gridArea(LAYOUT.statReviews)}>
          <ReviewsTodayCard />
        </div>
        <div className="grid-item" style={gridArea(LAYOUT.statAccuracy)}>
          <AccuracyCard />
        </div>
        <div className="grid-item" style={gridArea(LAYOUT.level)}>
          <LevelProgressCard />
        </div>
      </div>

      <Link
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-text-muted transition-[color,gap] duration-200 hover:gap-2.5 hover:text-white"
        href="/progress"
        onMouseEnter={handleProgressIntent}
        onFocus={handleProgressIntent}
        onTouchStart={handleProgressIntent}
      >
        View detailed progress
        <FaArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
