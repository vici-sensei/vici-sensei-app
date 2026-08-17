"use client";

import { useCountdown } from "@/lib/useCountdown";
import { formatCountdown } from "@/lib/study/countdown";

export function NextCardCountdown({ dueAt }: { dueAt: string }) {
  const remainingMs = useCountdown(dueAt);
  if (remainingMs === null) return null;
  return <>{formatCountdown(remainingMs)}</>;
}
