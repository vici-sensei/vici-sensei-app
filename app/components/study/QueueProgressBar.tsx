"use client";

import { useEffect, useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { useCountdown } from "@/lib/useCountdown";
import { formatCountdown } from "@/lib/study/countdown";

interface QueueProgressBarProps {
  completed: number;
  total: number;
  nextDueAt: string | null;
  /** Corrects the countdown below for a wrong device clock -- see useServerClockOffset. */
  clockOffsetMs: number;
  onExit: () => void;
}

export function QueueProgressBar({ completed, total, nextDueAt, clockOffsetMs, onExit }: QueueProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  // Surfaces a "+N" badge whenever a background refresh grows the queue
  // (e.g. a new card became due), so the count/percentage change isn't
  // silently confusing.
  const [badge, setBadge] = useState<{ id: number; delta: number } | null>(null);
  const prevTotalRef = useRef(total);
  const badgeIdRef = useRef(0);

  useEffect(() => {
    const prevTotal = prevTotalRef.current;
    if (total > prevTotal) {
      badgeIdRef.current += 1;
      setBadge({ id: badgeIdRef.current, delta: total - prevTotal });
    }
    prevTotalRef.current = total;
  }, [total]);

  const remainingMs = useCountdown(nextDueAt, clockOffsetMs);
  const showCountdown = remainingMs !== null && remainingMs > 0;

  return (
    <div className="px-4 pt-1 pb-2">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-white/5 text-text-muted [&>svg]:h-4 [&>svg]:w-4"
          onClick={onExit}
          aria-label="Exit study session"
        >
          <FaXmark />
        </button>
        <div className="flex flex-1 flex-col mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-accent-blue transition-[width] duration-400 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className={`text-center text-[0.75rem] text-text-muted/70 ${showCountdown ? "" : "invisible"}`}
          >
            Plus another card in {showCountdown ? formatCountdown(remainingMs) : "0s"}
          </p>
        </div>
        <div className="relative whitespace-nowrap text-[0.85rem] font-bold tabular-nums text-text-muted">
          {completed} / {total}
          {badge && (
            <span
              key={badge.id}
              onAnimationEnd={() => setBadge(null)}
              className="pointer-events-none absolute -top-3 right-0 animate-[vici-float-fade_1.6s_ease-out_forwards] text-lg font-extrabold text-accent-red"
            >
              +{badge.delta}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
