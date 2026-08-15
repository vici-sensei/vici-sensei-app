"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { cardsRemainingToday } from "@/lib/study/stats";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { DashboardHero } from "./DashboardHero";
import { CheckoutBanner } from "./CheckoutBanner";
import { WeekStreak } from "./WeekStreak";
import { LevelProgressCard } from "./LevelProgressCard";
import { FaBook, FaPenToSquare, FaFire, FaClock, FaArrowRight } from "react-icons/fa6";

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
  const offset = RING_CIRCUMFERENCE * (1 - percent / 100);
  return (
    <div className="relative mb-3.5 h-14 w-14 shrink-0">
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
          className={`${colorClass} transition-[stroke-dashoffset] duration-500`}
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
      <div className="mt-7 grid grid-cols-2 gap-[18px] md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
    <div className="mt-7 grid grid-cols-2 gap-[18px] md:grid-cols-3">
      <GlassCard padding="sm" className="flex flex-col items-center justify-center text-center sm:items-start sm:justify-start sm:text-left">
        <StatRing
          icon={<FaBook className="h-4 w-4" />}
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
          icon={<FaPenToSquare className="h-4 w-4" />}
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
          icon={<FaClock className="h-4 w-4" />}
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
  return (
    <div>
      <Suspense fallback={null}>
        <CheckoutBannerFromQuery />
      </Suspense>

      <div className="flex flex-col gap-[18px] md:flex-row md:flex-wrap">
        <div className="md:flex-1">
          <StreakCard />
        </div>
        <LevelProgressCard />
        <div className="order-2 md:order-3 md:basis-full">
          <DashboardHero />
        </div>
      </div>

      <StatCards />

      <Link
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-text-muted transition-[color,gap] duration-200 hover:gap-2.5 hover:text-white"
        href="/progress"
        prefetch={false}
      >
        View detailed progress
        <FaArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
