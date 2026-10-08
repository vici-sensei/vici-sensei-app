"use client";

import { useMemo } from "react";
import { formatClock, formatKey, localDateKey, monthRange } from "@/lib/lessons/time";
import { lessonKey, type LessonView } from "@/lib/lessons/types";

interface MonthViewProps {
  lessons: LessonView[];
  anchorKey: string;
  weekStart: number;
  tz: string;
  todayKey: string;
  /** Go to the week of this day, where classes are picked. */
  onPickDay: (dayKey: string) => void;
}

const MAX_CHIPS = 3;

/** The student's own lessons (and the ones cancelled that were theirs): this view is for finding your way around
 * the month, not for choosing a class. */
function isMine(l: LessonView): boolean {
  return l.mine !== null || (l.cancelled && l.was_mine);
}

function chipTone(l: LessonView): string {
  if (l.cancelled) return "border border-dashed border-accent-red/40 text-[#ff8a93] line-through decoration-white/30";
  if (l.mine === "move") return "bg-accent-blue/15 text-accent-blue";
  if (l.mine === "extra") return "bg-accent-gold/15 text-accent-gold";
  return "bg-accent-green/15 text-accent-green";
}

function dotTone(l: LessonView): string {
  if (l.cancelled) return "bg-accent-red";
  if (l.mine === "move") return "bg-accent-blue";
  if (l.mine === "extra") return "bg-accent-gold";
  return "bg-accent-green";
}

export function MonthView({ lessons, anchorKey, weekStart, tz, todayKey, onPickDay }: MonthViewProps) {
  const month = monthRange(anchorKey, weekStart, tz);
  const byDay = useMemo(() => {
    const map = new Map<string, LessonView[]>();
    for (const l of lessons) {
      if (!isMine(l)) continue;
      const key = localDateKey(l.startMs, tz);
      map.set(key, [...(map.get(key) ?? []), l].sort((a, b) => a.startMs - b.startMs));
    }
    return map;
  }, [lessons, tz]);

  const ownThisMonth = [...byDay].filter(([key]) => key >= month.firstKey && key <= month.lastKey).reduce((n, [, list]) => n + list.filter((l) => !l.cancelled).length, 0);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[0.72rem] font-extrabold uppercase tracking-wider text-text-muted">
        {month.weeks[0].map((key) => (
          <div key={key} className="py-1.5">
            {formatKey(key, { weekday: "short" })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {month.weeks.flat().map((key) => {
          const list = byDay.get(key) ?? [];
          const inMonth = key >= month.firstKey && key <= month.lastKey;
          const isToday = key === todayKey;
          const alive = list.filter((l) => !l.cancelled).length;
          const label = `${formatKey(key, { weekday: "long", month: "long", day: "numeric" })}${
            list.length === 0 ? ", no lessons of yours" : `, ${alive} ${alive === 1 ? "lesson" : "lessons"} of yours${list.length > alive ? `, ${list.length - alive} cancelled` : ""}`
          }`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPickDay(key)}
              aria-label={label}
              className={`flex min-h-[3.4rem] min-w-0 cursor-pointer flex-col rounded-lg border p-1.5 text-left transition-colors md:min-h-[5.6rem] ${
                isToday ? "border-accent-red/50 bg-accent-red/[0.06]" : "border-border-soft bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
              } ${inMonth ? "" : "opacity-40"}`}
            >
              <span className={`text-[0.82rem] font-extrabold ${isToday ? "text-accent-red" : ""}`}>{formatKey(key, { day: "numeric" })}</span>
              {/* Phones: a dot per lesson. From md up: the time and the name. */}
              <span className="mt-1 flex flex-wrap gap-1 md:hidden" aria-hidden="true">
                {list.slice(0, MAX_CHIPS).map((l) => (
                  <span key={lessonKey(l)} className={`h-2 w-2 rounded-full ${dotTone(l)}`} />
                ))}
              </span>
              <span className="mt-1 hidden min-w-0 flex-col gap-0.5 md:flex" aria-hidden="true">
                {list.slice(0, MAX_CHIPS).map((l) => (
                  <span key={lessonKey(l)} className={`truncate rounded px-1 py-0.5 text-[0.7rem] font-bold ${chipTone(l)}`}>
                    {formatClock(l.startMs, tz)} {l.title}
                  </span>
                ))}
                {list.length > MAX_CHIPS ? <span className="text-[0.68rem] text-text-muted">+{list.length - MAX_CHIPS} more</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[0.8rem] text-text-muted">
        {ownThisMonth === 0 ? "You have no lessons this month." : `You have ${ownThisMonth} ${ownThisMonth === 1 ? "lesson" : "lessons"} this month.`} Tap a day to see its week and pick classes.
      </p>
    </div>
  );
}
