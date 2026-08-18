"use client";

import { Fragment, useRef } from "react";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useAnimatedPercent } from "@/lib/useAnimatedPercent";
import { useInView } from "@/lib/useInView";
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
  const animatedSeenPct = useAnimatedPercent(seenPct, inView);
  const animatedLearnedPct = useAnimatedPercent(learnedPct, inView);
  const circumference = 2 * Math.PI * radius;
  const seenOffset = circumference * (1 - animatedSeenPct / 100);
  const learnedOffset = circumference * (1 - animatedLearnedPct / 100);

  return (
    <g>
      <circle cx={CENTER} cy={CENTER} r={radius} fill="none" strokeWidth={STROKE} className="stroke-white/10" />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={radius}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={seenOffset}
        className={`${strokeClass}/35 transition-[stroke-dashoffset] duration-1000 ease-out`}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={radius}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={learnedOffset}
        className={`${strokeClass} transition-[stroke-dashoffset] duration-1000 ease-out`}
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
      <GlassCard padding="sm" className="order-3 flex w-full items-center justify-center md:w-fit md:shrink-0">
        <Skeleton className="h-[110px] w-[110px] rounded-full md:h-[150px] md:w-[150px]" />
      </GlassCard>
    );
  }

  const progress = stats.level_progress;
  if (!progress) return null;

  return (
    <GlassCard
      ref={cardRef}
      padding="sm"
      role="button"
      tabIndex={0}
      aria-label={`${progress.level} progress details`}
      className={`order-3 flex flex-wrap items-center justify-center gap-5 md:gap-10 w-full xl:w-fit !cursor-default`}
    >
      <div ref={ringsRef} className="relative h-[110px] w-[110px] shrink-0 md:h-[150px] md:w-[150px]">
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
              <div className="text-sm font-semibold text-white">{ring.label}</div>
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
