"use client";

import type { LeaderboardMetric } from "@/lib/types";

const METRICS: { value: LeaderboardMetric; label: string }[] = [
  { value: "xp", label: "XP" },
  { value: "reviews", label: "Reviews" },
  { value: "new_cards", label: "New cards" },
  { value: "streak", label: "Streak" },
];

export function LeaderboardTabs({
  active,
  onChange,
}: {
  active: LeaderboardMetric;
  onChange: (metric: LeaderboardMetric) => void;
}) {
  const tabClasses = (isActive: boolean) =>
    `cursor-pointer rounded-[9px] px-5 py-[9px] text-[0.88rem] font-bold ${
      isActive ? "bg-accent-red text-white" : "text-text-muted"
    }`;

  return (
    <div className="mb-5.5 flex justify-center md:justify-start">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border-soft bg-white/[0.03] p-1">
        {METRICS.map((metric) => (
          <button
            key={metric.value}
            type="button"
            className={tabClasses(active === metric.value)}
            onClick={() => onChange(metric.value)}
          >
            {metric.label}
          </button>
        ))}
      </div>
    </div>
  );
}
