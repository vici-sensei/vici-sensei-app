"use client";

import { Suspense, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { prefetchProgressSummary } from "@/lib/client-data/progress";
import { useInView } from "@/lib/useInView";
import { useCountUp } from "@/lib/useCountUp";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { AnimatedRingStroke, RingTrack } from "@/app/components/ui/AnimatedRing";
import { DashboardHero } from "./DashboardHero";
import { NextCardCountdown } from "./NextCardCountdown";
import { CheckoutBanner } from "./CheckoutBanner";
import { WeekStreak } from "./WeekStreak";
import { LevelProgressCard } from "./LevelProgressCard";
import { FaBook, FaFire, FaArrowRight, FaArrowsRotate, FaTrophy } from "react-icons/fa6";
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

// Scattered across the whole card behind the streak number when a new record just landed.
// Sakura-ish palette (pink/blush/white), fixed positions/colors/speeds (not randomized) so the
// layout is stable across re-renders and SSR. `top` is each petal's resting position -- used
// as-is when motion is reduced (see .vici-confetti-petal in globals.css), and as the starting
// point the fall animation reads from before overriding it. `delay`/`driftDelay` are negative and
// roughly proportional to their durations so every petal is already mid-fall and mid-rotation on
// first paint instead of all starting in sync.
const CONFETTI_PETALS: {
  top: string;
  left: string;
  size: number;
  color: string;
  duration: number;
  delay: number;
  driftDuration: number;
  driftDelay: number;
}[] = [
  { top: "10%", left: "8%", size: 9, color: "bg-accent-pink", duration: 11, delay: -2, driftDuration: 4.2, driftDelay: -0.6 },
  { top: "20%", left: "80%", size: 7, color: "bg-white", duration: 9, delay: -5, driftDuration: 3.6, driftDelay: -2.1 },
  { top: "68%", left: "16%", size: 8, color: "bg-accent-pink", duration: 12, delay: -1, driftDuration: 5, driftDelay: -1.4 },
  { top: "78%", left: "88%", size: 10, color: "bg-[#ffd9e6]", duration: 8, delay: -6, driftDuration: 4.6, driftDelay: -3 },
  { top: "42%", left: "94%", size: 7, color: "bg-accent-pink", duration: 13, delay: -3.5, driftDuration: 3.9, driftDelay: -0.2 },
  { top: "6%", left: "46%", size: 8, color: "bg-white", duration: 10, delay: -4, driftDuration: 4.8, driftDelay: -1.8 },
  { top: "86%", left: "52%", size: 9, color: "bg-[#ffd9e6]", duration: 9.5, delay: -7, driftDuration: 4.1, driftDelay: -2.6 },
  { top: "52%", left: "2%", size: 7, color: "bg-accent-pink", duration: 8.5, delay: -1.5, driftDuration: 3.4, driftDelay: -3.4 },
];

// Purely decorative -- sits behind the card content (see the isolate+overflow-hidden/z-0/z-10
// split in StreakCard below) so it never needs to fight the shell Header (z-50) or
// MobileNavMenu (z-45) for stacking: `isolate` on the card gives this whole subtree its own
// stacking context, so no z-index in here can ever escape above page chrome outside the card.
function RecordConfetti() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {CONFETTI_PETALS.map((petal, i) => (
        <span
          key={i}
          className={`vici-confetti-petal absolute ${petal.color}`}
          style={
            {
              top: petal.top,
              left: petal.left,
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

function StreakCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();
  const streak = stats?.streak ?? 0;
  const record = stats?.streak_record ?? 0;
  const displayedStreak = useCountUp(streak);
  const activity = stats?.weekly_activity ?? placeholderWeekActivity();
  // Once the live streak reaches the longest one ever, it *is* the record from here on
  // (longest_streak tracks current_streak in lockstep past that point) -- so this stays
  // true for the rest of the run, not just the single day it was broken.
  const isNewRecord = streak > 0 && streak >= record;

  return (
    <GlassCard
      padding="sm"
      tone={isNewRecord ? "gold" : "default"}
      // isolate: gives this card its own stacking context, so RecordConfetti's z-0 and the
      // content wrapper's z-10 below are only ever compared against each other -- never against
      // the shell Header/MobileNavMenu's z-50/z-45 outside the card. overflow-hidden clips the
      // dots to the card's own rounded corners.
      className={isNewRecord ? "isolate overflow-hidden" : undefined}
    >
      {isNewRecord && <RecordConfetti />}
      <div className="relative z-10 flex flex-col gap-2 sm:gap-6 text-center sm:flex-row sm:flex-wrap sm:text-left justify-center items-center h-full">
        {isNewRecord ? (
          <div className="flex flex-col items-center gap-1">
            <div className="text-4xl font-extrabold leading-none tracking-tight text-accent-gold">{displayedStreak}</div>
            <div className="flex flex-wrap w-full items-center justify-center gap-1.5 text-sm font-bold text-accent-gold">
              <FaTrophy className="h-3 w-3" />
              <div className="text-center">
                New personal best
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3.5 sm:gap-6">
            <div className="flex flex-col items-center sm:gap-2">
              <div className="text-3xl font-extrabold leading-none tracking-tight text-accent-gold">{displayedStreak}</div>
              <div className="text-sm font-semibold text-text-muted text-center">Day streak</div>
            </div>
            <div className="flex flex-col items-center sm:gap-2">
              <div className="text-3xl font-extrabold leading-none tracking-tight">{record}</div>
              <div className="text-sm font-semibold text-text-muted text-center">Best streak</div>
            </div>
          </div>
        )}
        <WeekStreak activity={activity} streak={streak} />
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

// Fallback limits shown before the user's real per-day limit has loaded -- each matches the
// corresponding DEFAULT_NEW_*_PER_DAY in lib/data/studyStats.ts (and its user_study_settings
// column default).
const FALLBACK_NEW_KANJI_LIMIT = 1;
const FALLBACK_NEW_VOCAB_LIMIT = 6;
const FALLBACK_NEW_HIRAGANA_LIMIT = 15;
const FALLBACK_NEW_KATAKANA_LIMIT = 15;

/** Shared by the four "new X today" cards below — same ring+number+label shape, differing only
 * in icon, color, today/limit values, and label text. Reuses the same StudyStatsProvider poll
 * the shell layout and DashboardHero already run — no separate fetch in any of them. */
function NewCardStat({
  icon,
  colorClass,
  today,
  limit,
  label,
}: {
  icon: React.ReactNode;
  colorClass: string;
  today: number;
  limit: number;
  label: string;
}) {
  return (
    <GlassCard padding="sm" className="flex flex-col items-center text-center">
      <StatRing icon={icon} percent={statPct(today, limit)} colorClass={colorClass} />
      <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
        {today}
        <span className="text-[1.1rem] text-text-muted">/{limit}</span>
      </div>
      <div className="text-sm font-semibold text-text-muted">{label}</div>
    </GlassCard>
  );
}

function NewKanjiCard() {
  const { stats } = useStudyStats();
  return (
    <NewCardStat
      icon={<span className="text-[27px] font-medium leading-none">竜</span>}
      colorClass="stroke-accent-blue"
      today={stats?.new_kanji_today ?? 0}
      limit={stats?.new_kanji_limit ?? FALLBACK_NEW_KANJI_LIMIT}
      label="New kanji today"
    />
  );
}

function NewVocabCard() {
  const { stats } = useStudyStats();
  return (
    <NewCardStat
      icon={<FaBook className="h-6 w-6" />}
      colorClass="stroke-accent-violet"
      today={stats?.new_vocab_today ?? 0}
      limit={stats?.new_vocab_limit ?? FALLBACK_NEW_VOCAB_LIMIT}
      label="New vocab today"
    />
  );
}

function NewHiraganaCard() {
  const { stats } = useStudyStats();
  return (
    <NewCardStat
      icon={<span className="text-[27px] font-medium leading-none">あ</span>}
      colorClass="stroke-accent-blue"
      today={stats?.new_hiragana_today ?? 0}
      limit={stats?.new_hiragana_limit ?? FALLBACK_NEW_HIRAGANA_LIMIT}
      label="New hiragana today"
    />
  );
}

function NewKatakanaCard() {
  const { stats } = useStudyStats();
  return (
    <NewCardStat
      icon={<span className="text-[27px] font-medium leading-none">ア</span>}
      colorClass="stroke-accent-violet"
      today={stats?.new_katakana_today ?? 0}
      limit={stats?.new_katakana_limit ?? FALLBACK_NEW_KATAKANA_LIMIT}
      label="New katakana today"
    />
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
      {/* Same reasoning as DashboardHero's moreReviewComingToday: only worth a callout when
          it's an independent, long-scheduled review becoming due -- a learning/relearning row
          resurfacing is just an SRS retry the user already knows about (see next_due_status in
          lib/srs/nextDue.ts). */}
      {stats && stats.next_due_is_today && stats.next_due_at && stats.next_due_status === "review" && (
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

const LAYOUT: Record<"hero" | "streak", ResponsivePlacement> = {
  // Hero + Streak: stacked (each full width) below "md" (768px); paired on one row,
  // 8/4 split, from "md" up.
  hero: { base: { row: 1, col: 1, colSpan: 12 }, md: { row: 1, col: 1, colSpan: 8 } },

  streak: { base: { row: 2, col: 1, colSpan: 12 }, md: { row: 1, col: 9, colSpan: 4 } },
};

/** Placement for the `index`-th (0-based) of `count` stat cards -- "New X today" cards plus
 * Reviews/Accuracy, whichever of the four "new X today" ones are actually enabled (see
 * showPrimary/showSecondary in DashboardPage). Below "xs" (280px) each gets its own full-width
 * row; from "xs" to "sm" (480px, the common phone-width range) they sit 2 per row, except a lone
 * odd-one-out on the last row (count is odd and this is its final card) spans the full row
 * instead of leaving its other half empty; from "sm" up (including "md", which just moves the
 * row up since Hero+Streak now share row 1) they split ONE row evenly across all 12 columns --
 * so e.g. 3 cards take 4 columns each instead of the usual 3, filling the row completely instead
 * of leaving the 4th card's column reserved and blank. */
function statCardPlacement(index: number, count: number): ResponsivePlacement {
  const colSpan = 12 / count;
  const isLoneLastCard = count % 2 === 1 && index === count - 1;
  return {
    base: { row: 3 + index, col: 1, colSpan: 12 },
    xs: isLoneLastCard
      ? { row: 3 + Math.floor(index / 2), col: 1, colSpan: 12 }
      : { row: 3 + Math.floor(index / 2), col: 1 + (index % 2) * 6, colSpan: 6 },
    sm: { row: 3, col: 1 + index * colSpan, colSpan },
    md: { row: 2 },
  };
}

/** Always the last row, full width, at every breakpoint -- right after however many rows the
 * stat cards actually took (see statCardPlacement). "sm"/"md" don't depend on `count` since
 * those tiers always pack every stat card into a single row regardless of how many there are. */
function levelPlacement(count: number): ResponsivePlacement {
  return {
    base: { row: 3 + count, col: 1, colSpan: 12 },
    xs: { row: 3 + Math.ceil(count / 2), col: 1, colSpan: 12 },
    sm: { row: 4, col: 1, colSpan: 12 },
    md: { row: 3 },
  };
}

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

  // Assume enabled while stats haven't loaded yet, so the card doesn't flash in once they do --
  // once loaded, hide it if the user has turned that category off (at least one of the current
  // track's pair always stays on, so this never hides both).
  const showPrimary = stats ? (isKana ? stats.study_hiragana : stats.study_kanji) : true;
  const showSecondary = stats ? (isKana ? stats.study_katakana : stats.study_vocabulary) : true;

  const statCards: React.ReactNode[] = [];
  if (showPrimary) statCards.push(isKana ? <NewHiraganaCard key="primary" /> : <NewKanjiCard key="primary" />);
  if (showSecondary) statCards.push(isKana ? <NewKatakanaCard key="secondary" /> : <NewVocabCard key="secondary" />);
  statCards.push(<ReviewsTodayCard key="reviews" />);
  statCards.push(<AccuracyCard key="accuracy" />);

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
        {statCards.map((card, i) => (
          <div className="grid-item" key={i} style={gridArea(statCardPlacement(i, statCards.length))}>
            {card}
          </div>
        ))}
        <div className="grid-item" style={gridArea(levelPlacement(statCards.length))}>
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
