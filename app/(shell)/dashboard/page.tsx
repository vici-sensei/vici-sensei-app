"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { useAuth } from "@/lib/auth/AuthProvider";
import { prefetchProgressSummary } from "@/lib/client-data/progress";
import { cardsRemainingToday } from "@/lib/study/stats";
import { useAnimatedPercent } from "@/lib/useAnimatedPercent";
import { useInView } from "@/lib/useInView";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { DashboardHero } from "./DashboardHero";
import { NextCardCountdown } from "./NextCardCountdown";
import { CheckoutBanner } from "./CheckoutBanner";
import { WeekStreak } from "./WeekStreak";
import { LevelProgressCard } from "./LevelProgressCard";
import { FaBook, FaFire, FaArrowRight, FaArrowsRotate } from "react-icons/fa6";

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

function StreakCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();

  if (!stats) {
    return (
      <GlassCard padding="sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="sm">
      <div className="flex flex-col gap-2 sm:gap-6 text-center sm:flex-row sm:flex-wrap sm:text-left justify-center items-center h-full">
        <div className="flex items-center gap-3.5">
          <div className="flex flex-col items-center sm:gap-2">
            <div className="text-3xl font-extrabold leading-none tracking-tight text-accent-gold">{stats.streak}</div>
            <div className="text-sm font-semibold text-text-muted">Day streak</div>
          </div>
        </div>
        <WeekStreak
          activity={stats.weekly_activity}
          streak={stats.streak}
          todayDone={cardsRemainingToday(stats) === 0}
        />
      </div>
    </GlassCard>
  );
}

const RING_SIZE = 56;
const RING_STROKE = 4;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = RING_CENTER - RING_STROKE / 2 - 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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
  const animatedPercent = useAnimatedPercent(percent, inView);
  const offset = RING_CIRCUMFERENCE * (1 - animatedPercent / 100);
  return (
    <div ref={ref} className="relative mb-3.5 h-14 w-14 shrink-0">
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="h-full w-full -rotate-90">
        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-white/10"
        />
        <circle
          cx={RING_CENTER}
          cy={RING_CENTER}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={`${colorClass} transition-[stroke-dashoffset] duration-1000 ease-out`}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center ${colorClass.replace("stroke-", "text-")}`}>
        {icon}
      </div>
    </div>
  );
}

function StatCards() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i} padding="sm" className="flex flex-col items-center justify-center sm:items-start sm:justify-start">
            <Skeleton className="mb-3.5 h-14 w-14 rounded-full" />
            <Skeleton className="mb-1.5 h-8 w-16" />
            <Skeleton className="h-4 w-24" />
          </GlassCard>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-[18px] md:grid-cols-3">
      <GlassCard padding="sm" className="flex flex-col items-center justify-center text-center sm:items-start sm:justify-start sm:text-left">
        <StatRing
          icon={<span className="text-[27px] font-medium leading-none">竜</span>}
          percent={statPct(stats.new_kanji_today, stats.new_kanji_limit)}
          colorClass="stroke-accent-blue"
        />
        <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
          {stats.new_kanji_today}
          <span className="text-[1.1rem] text-text-muted">/{stats.new_kanji_limit}</span>
        </div>
        <div className="text-sm font-semibold text-text-muted">New kanji today</div>
      </GlassCard>

      <GlassCard padding="sm" className="flex flex-col items-center justify-center text-center sm:items-start sm:justify-start sm:text-left">
        <StatRing
          icon={<FaBook className="h-6 w-6" />}
          percent={statPct(stats.new_vocab_today, stats.new_vocab_limit)}
          colorClass="stroke-accent-violet"
        />
        <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
          {stats.new_vocab_today}
          <span className="text-[1.1rem] text-text-muted">/{stats.new_vocab_limit}</span>
        </div>
        <div className="text-sm font-semibold text-text-muted">New vocab today</div>
      </GlassCard>

      <GlassCard padding="sm" className="flex flex-col items-center justify-center text-center sm:items-start sm:justify-start sm:text-left">
        <StatRing
          icon={<FaArrowsRotate className="h-7 w-7" />}
          percent={statPct(stats.reviewed_today, stats.reviewed_today + stats.due_today)}
          colorClass="stroke-accent-orange"
        />
        <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
          {stats.reviewed_today}
          <span className="text-[1.1rem] text-text-muted">/{stats.reviewed_today + stats.due_today}</span>
        </div>
        <div className="text-sm font-semibold text-text-muted">Reviews done today</div>
        {stats.due_today === 0 && stats.next_due_is_today && stats.next_due_at && (
          <div className="mt-1 text-[0.7rem] font-semibold text-accent-gold">
            Next card in <NextCardCountdown dueAt={stats.next_due_at} />
          </div>
        )}
      </GlassCard>

      <GlassCard padding="sm" className="flex flex-col items-center justify-center text-center sm:items-start sm:justify-start sm:text-left">
        <StatRing
          icon={<TargetFillIcon className="h-8 w-8" />}
          percent={stats.retention_rate != null ? Math.round(stats.retention_rate * 100) : 0}
          colorClass="stroke-accent-red"
        />
        <div
          className={
            stats.retention_rate != null
              ? "mb-1.5 text-3xl font-extrabold leading-none tracking-tight"
              : "mb-1.5 text-3xl font-semibold leading-none tracking-tight text-text-muted"
          }
        >
          {stats.retention_rate != null ? `${Math.round(stats.retention_rate * 100)}%` : "N/A"}
        </div>
        <div className="text-sm font-semibold text-text-muted">Accuracy (30d)</div>
      </GlassCard>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();

  function handleProgressIntent() {
    if (user) prefetchProgressSummary(user.id);
  }

  return (
    <div>
      <Suspense fallback={null}>
        <CheckoutBannerFromQuery />
      </Suspense>

      <div className="flex flex-col gap-[18px] md:flex-row md:flex-wrap">
        <div className="order-1 md:basis-full">
          <DashboardHero />
        </div>
        <div className="order-2 md:flex-1">
          <StreakCard />
        </div>
        <LevelProgressCard />
        <div className="order-3 md:order-4 md:basis-full">
          <StatCards />
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
