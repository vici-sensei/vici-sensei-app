"use client";

import type { LeaderboardPeriod } from "@/lib/types";

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "all_time", label: "All-time" },
];

export function LeaderboardPeriodSelector({
  active,
  onChange,
}: {
  active: LeaderboardPeriod;
  onChange: (period: LeaderboardPeriod) => void;
}) {
  const pillClasses = (isActive: boolean) =>
    `cursor-pointer rounded-lg px-3.5 py-[7px] text-[0.8rem] font-bold ${
      isActive ? "bg-white/10 text-white" : "text-text-muted hover:text-white"
    }`;

  return (
    <div className="mb-5.5 flex flex-wrap justify-center gap-1.5 md:justify-start">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          type="button"
          className={pillClasses(active === period.value)}
          onClick={() => onChange(period.value)}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
