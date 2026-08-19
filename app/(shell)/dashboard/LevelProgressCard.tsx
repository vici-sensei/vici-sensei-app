"use client";

import { Fragment, useRef } from "react";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useInView } from "@/lib/useInView";
import { AnimatedRingStroke, RingTrack } from "@/app/components/ui/AnimatedRing";
import type { LevelProgress } from "@/lib/types";

const SIZE = 150;
const STROKE = 9;
const GAP = 6;
const CENTER = SIZE / 2;

// Outermost first -- each ring nests inside the previous one, sharing a center.
const RINGS: { key: keyof Pick<LevelProgress, "kanji" | "kanji_reading" | "vocabulary">; label: string; dot: string; stroke: string; text: string; textDim: string }[] = [
  { key: "kanji", label: "Kanji meaning", dot: "bg-accent-violet", stroke: "stroke-accent-violet", text: "text-accent-violet", textDim: "text-accent-violet/70" },
  { key: "kanji_reading", label: "Kanji reading", dot: "bg-accent-blue", stroke: "stroke-accent-blue", text: "text-accent-blue", textDim: "text-accent-blue/70" },
  { key: "vocabulary", label: "Vocabulary", dot: "bg-accent-orange", stroke: "stroke-accent-orange", text: "text-accent-orange", textDim: "text-accent-orange/70" },
];

function pct(seen: number, total: number): number {
  return total > 0 ? Math.round((seen / total) * 100) : 0;
}

function radiusFor(index: number): number {
  return CENTER - 4 - STROKE / 2 - index * (STROKE + GAP);
}

function LevelRing({
  radius,
  seenPct,
  learnedPct,
  strokeClass,
  inView,
}: {
  radius: number;
  seenPct: number;
  learnedPct: number;
  strokeClass: string;
  inView: boolean;
}) {
  return (
    <g>
      <RingTrack cx={CENTER} cy={CENTER} radius={radius} strokeWidth={STROKE} />
      <AnimatedRingStroke
        cx={CENTER}
        cy={CENTER}
        radius={radius}
        strokeWidth={STROKE}
        percent={seenPct}
        inView={inView}
        className={`${strokeClass}/35`}
      />
      <AnimatedRingStroke
        cx={CENTER}
        cy={CENTER}
        radius={radius}
        strokeWidth={STROKE}
        percent={learnedPct}
        inView={inView}
        className={strokeClass}
      />
    </g>
  );
}

export function LevelProgressCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();
  const cardRef = useRef<HTMLDivElement>(null);
  const [ringsRef, ringsInView] = useInView<HTMLDivElement>();

  if (!stats) {
    return (
      <GlassCard padding="sm" className="flex flex-wrap items-center justify-center gap-5 xl:gap-10">
        <Skeleton className="h-[110px] w-[110px] shrink-0 rounded-full xl:h-[150px] xl:w-[150px]" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  const progress = stats.level_progress;
  if (!progress) return null;

  return (
    <GlassCard
      ref={cardRef}
      padding="sm"
      aria-label={`${progress.level} progress details`}
      className={`flex flex-wrap items-center justify-center gap-5 xl:gap-10 !cursor-default`}
    >
      <div ref={ringsRef} className="relative h-[110px] w-[110px] shrink-0 xl:h-[150px] xl:w-[150px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90">
          {RINGS.map((ring, i) => {
            const cat = progress[ring.key];
            return (
              <LevelRing
                key={ring.key}
                radius={radiusFor(i)}
                seenPct={pct(cat.seen, cat.total)}
                learnedPct={pct(cat.learned, cat.total)}
                strokeClass={ring.stroke}
                inView={ringsInView}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold tracking-tight">
          {progress.level}
        </div>
      </div>

      {/* Legend */}

      <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-6 gap-y-2.5">

        <div></div>
        <div className="justify-self-center text-xs text-text-muted">Seen at least once</div>
        <div className="justify-self-center text-xs text-text-muted">Already learned</div>

        {RINGS.map((ring) => {
          const cat = progress[ring.key];
          return (
            <Fragment key={ring.key}>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className={`h-2 w-2 shrink-0 rounded-full ${ring.dot}`} />
                {ring.label}
              </div>
              <div className={`justify-self-center text-sm font-bold ${ring.textDim}`}>
                {pct(cat.seen, cat.total)}%
              </div>
              <div className={`justify-self-center text-sm font-bold ${ring.text}`}>
                {pct(cat.learned, cat.total)}%
              </div>
            </Fragment>
          );
        })}

      </div>
    </GlassCard>
  );
}
