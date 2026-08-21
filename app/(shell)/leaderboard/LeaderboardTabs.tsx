"use client";

import { PillSelector } from "@/app/components/ui/PillSelector";
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
  return (
    <PillSelector
      options={METRICS}
      active={active}
      onChange={onChange}
      variant="tabs"
      className="mb-5.5 justify-center md:justify-start"
    />
  );
}
