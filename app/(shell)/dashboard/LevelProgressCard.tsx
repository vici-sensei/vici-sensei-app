"use client";

import { useEffect, useRef, useState } from "react";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { LevelProgress } from "@/lib/types";

const SIZE = 150;
const STROKE = 9;
const GAP = 6;
const CENTER = SIZE / 2;

// Outermost first -- each ring nests inside the previous one, sharing a center.
const RINGS: { key: keyof Pick<LevelProgress, "kanji" | "kanji_reading" | "vocabulary">; label: string; dot: string; stroke: string }[] = [
  { key: "kanji", label: "Kanji", dot: "bg-accent-violet", stroke: "stroke-accent-violet" },
  { key: "kanji_reading", label: "Kanji readings", dot: "bg-accent-blue", stroke: "stroke-accent-blue" },
  { key: "vocabulary", label: "Vocabulary", dot: "bg-accent-orange", stroke: "stroke-accent-orange" },
];

function pct(seen: number, total: number): number {
  return total > 0 ? Math.round((seen / total) * 100) : 0;
}

function radiusFor(index: number): number {
  return CENTER - 4 - STROKE / 2 - index * (STROKE + GAP);
}

export function LevelProgressCard() {
  // Reuses the same StudyStatsProvider poll the shell layout and DashboardHero already run —
  // no separate fetch here.
  const { stats } = useStudyStats();
  const [legendOpen, setLegendOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!legendOpen) return;
    function onOutsideClick(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setLegendOpen(false);
    }
    document.addEventListener("click", onOutsideClick);
    return () => document.removeEventListener("click", onOutsideClick);
  }, [legendOpen]);

  if (!stats) {
    return (
      <GlassCard padding="sm" className="order-3 flex w-full items-center justify-center md:order-2 md:w-fit md:shrink-0">
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
      aria-expanded={legendOpen}
      aria-label={`${progress.level} progress details`}
      onMouseEnter={() => setLegendOpen(true)}
      onMouseLeave={() => setLegendOpen(false)}
      onClick={() => setLegendOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setLegendOpen((o) => !o);
        }
      }}
      className={`order-3 flex w-full cursor-pointer select-none items-center justify-center md:order-2 md:w-fit md:shrink-0 ${legendOpen ? "z-10" : ""}`}
    >
      <div className="relative h-[110px] w-[110px] shrink-0 md:h-[150px] md:w-[150px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full -rotate-90">
          {RINGS.map((ring, i) => {
            const r = radiusFor(i);
            const circumference = 2 * Math.PI * r;
            const cat = progress[ring.key];
            const seenOffset = circumference * (1 - pct(cat.seen, cat.total) / 100);
            const learnedOffset = circumference * (1 - pct(cat.learned, cat.total) / 100);
            return (
              <g key={ring.key}>
                <circle cx={CENTER} cy={CENTER} r={r} fill="none" strokeWidth={STROKE} className="stroke-white/10" />
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={r}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={seenOffset}
                  className={`${ring.stroke}/35 transition-[stroke-dashoffset] duration-500`}
                />
                <circle
                  cx={CENTER}
                  cy={CENTER}
                  r={r}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={learnedOffset}
                  className={`${ring.stroke} transition-[stroke-dashoffset] duration-500`}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold tracking-tight">
          {progress.level}
        </div>
      </div>

      {legendOpen && (
        <div
          className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-xl border border-border-soft bg-bg-main p-3.5 text-left shadow-[0_12px_30px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2.5 text-[0.7rem] leading-normal text-text-muted">
            Lighter ring = seen at least once. <br/> Solid ring = already learned.
          </div>
          <div className="space-y-2">
            {RINGS.map((ring) => {
              const cat = progress[ring.key];
              return (
                <div key={ring.key} className="flex items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ring.dot}`} />
                  <span className="font-semibold text-white">{ring.label}</span>
                  <span className="ml-auto flex items-center gap-4 text-[0.75rem] text-text-muted">
                    <span>{pct(cat.seen, cat.total)}%</span>
                    <span>·</span>
                    <span>{pct(cat.learned, cat.total)}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
