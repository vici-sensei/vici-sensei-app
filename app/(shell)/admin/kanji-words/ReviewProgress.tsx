"use client";

import { useMemo } from "react";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { KanjiWordsRow } from "@/lib/types";
import { KANJI_LEVELS } from "./kanjiWordsView";

// Same hues as LevelBadge, so a level reads the same here as on its badge in the list.
const LEVEL_TONES: Record<string, { fill: string; text: string }> = {
  N5: { fill: "bg-green-400/30", text: "text-green-400" },
  N4: { fill: "bg-blue-400/30", text: "text-blue-400" },
  N3: { fill: "bg-orange-400/30", text: "text-orange-400" },
  N2: { fill: "bg-accent-red/30", text: "text-accent-red" },
  N1: { fill: "bg-pink-400/30", text: "text-pink-400" },
};
const ALL_TONE = { fill: "bg-white/20", text: "text-white" };

/** 0% only when none are done and 100% only when all are, so one reviewed kanji never rounds away. */
function percent(reviewed: number, total: number): number {
  if (total === 0 || reviewed === 0) return 0;
  if (reviewed === total) return 100;
  return Math.min(99, Math.max(1, Math.round((reviewed / total) * 100)));
}

/** One thin row of pills, one per JLPT level plus the overall one, each filled as far as it's reviewed
 * and labelled with just its percentage; the exact counts are in the tooltip. */
export function ReviewProgress({ rows, loading }: { rows: KanjiWordsRow[]; loading: boolean }) {
  const segments = useMemo(() => {
    const byLevel = new Map(KANJI_LEVELS.map((level) => [level as string, { total: 0, reviewed: 0 }]));
    let reviewed = 0;
    for (const row of rows) {
      const entry = byLevel.get(row.lv ?? "");
      if (entry) {
        entry.total += 1;
        if (row.r) entry.reviewed += 1;
      }
      if (row.r) reviewed += 1;
    }
    return [
      ...KANJI_LEVELS.map((level) => ({ label: level as string, ...byLevel.get(level)!, tone: LEVEL_TONES[level] })),
      { label: "All", total: rows.length, reviewed, tone: ALL_TONE },
    ];
  }, [rows]);

  if (loading) return <Skeleton className="mb-4 h-5 w-full rounded-full" />;

  return (
    <div className="mb-4 flex gap-1">
      {segments.map(({ label, total, reviewed, tone }) => {
        const pct = percent(reviewed, total);
        return (
          <div
            key={label}
            role="progressbar"
            aria-label={`${label} kanji reviewed`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={reviewed}
            title={`${label}: ${reviewed} of ${total} kanji reviewed`}
            className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]"
          >
            <div
              className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${tone.fill}`}
              style={{ width: `${total === 0 ? 0 : (reviewed / total) * 100}%` }}
            />
            <span
              className={`relative flex h-full items-center justify-center gap-1 text-[0.68rem] font-extrabold leading-none ${tone.text}`}
            >
              {label}
              <span className="tabular-nums">{pct}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
