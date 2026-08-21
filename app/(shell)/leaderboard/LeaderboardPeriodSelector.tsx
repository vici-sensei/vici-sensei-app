"use client";

import { PillSelector } from "@/app/components/ui/PillSelector";
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
  return (
    <PillSelector
      options={PERIODS}
      active={active}
      onChange={onChange}
      variant="compact"
      className="mb-5.5 justify-center md:justify-start w-fit mx-auto md:mx-0"
    />
  );
}
