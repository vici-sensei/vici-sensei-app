"use client";

import { formatKey, monthRange } from "@/lib/lessons/time";

interface YearViewProps {
  anchorKey: string;
  weekStart: number;
  tz: string;
  todayKey: string;
  /** Go to that month (its first day). */
  onPickMonth: (monthFirstKey: string) => void;
}

/** The year is only a way to jump somewhere quickly: twelve small calendars, no lessons. */
export function YearView({ anchorKey, weekStart, tz, todayKey, onPickMonth }: YearViewProps) {
  const year = anchorKey.slice(0, 4);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`).map((first) => {
        const month = monthRange(first, weekStart, tz);
        const current = todayKey.slice(0, 7) === first.slice(0, 7);
        return (
          <button
            key={first}
            type="button"
            onClick={() => onPickMonth(first)}
            aria-label={formatKey(first, { month: "long", year: "numeric" })}
            className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
              current ? "border-accent-red/50 bg-accent-red/[0.05]" : "border-border-soft bg-bg-cards hover:border-white/25"
            }`}
          >
            <span className={`text-[0.9rem] font-extrabold ${current ? "text-accent-red" : ""}`}>{formatKey(first, { month: "long" })}</span>
            <span className="mt-2 grid grid-cols-7 gap-px text-center text-[0.6rem] leading-[1.15rem]" aria-hidden="true">
              {month.weeks.flat().map((key) => {
                const inMonth = key >= month.firstKey && key <= month.lastKey;
                return (
                  <span
                    key={key}
                    className={`rounded ${inMonth ? "text-text-muted" : "opacity-0"} ${key === todayKey ? "bg-accent-red font-extrabold text-white" : ""}`}
                  >
                    {formatKey(key, { day: "numeric" })}
                  </span>
                );
              })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
