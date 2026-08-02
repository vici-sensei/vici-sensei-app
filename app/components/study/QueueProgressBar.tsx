"use client";

import { useEffect, useRef, useState } from "react";
import { FaXmark } from "react-icons/fa6";

interface QueueProgressBarProps {
  completed: number;
  total: number;
  nextDueAt: string | null;
  onExit: () => void;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));

  if (totalSeconds >= YEAR) return `${Math.floor(totalSeconds / YEAR)}y`;
  if (totalSeconds >= MONTH) return `${Math.floor(totalSeconds / MONTH)}mo`;
  if (totalSeconds >= WEEK) return `${Math.floor(totalSeconds / WEEK)}w`;
  if (totalSeconds >= DAY) return `${Math.floor(totalSeconds / DAY)}d`;
  if (totalSeconds >= HOUR) return `${Math.floor(totalSeconds / HOUR)}h`;
  if (totalSeconds >= MINUTE) return `${Math.floor(totalSeconds / MINUTE)}m`;
  return `${totalSeconds}s`;
}

export function QueueProgressBar({ completed, total, nextDueAt, onExit }: QueueProgressBarProps) {
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

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!nextDueAt) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [nextDueAt]);

  const remainingMs = nextDueAt ? new Date(nextDueAt).getTime() - now : null;
  const showCountdown = remainingMs !== null && remainingMs > 0;

  return (
    <div className="px-7 py-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-white/5 text-text-muted [&>svg]:h-4 [&>svg]:w-4"
          onClick={onExit}
          aria-label="Exit study session"
        >
          <FaXmark />
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent-red),var(--color-accent-blue))] transition-[width] duration-400 ease-linear"
            style={{ width: `${pct}%` }}
          />
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
      <p
        className={`mt-2 text-center text-[0.75rem] text-text-muted/70 ${showCountdown ? "" : "invisible"}`}
      >
        Next card in {showCountdown ? formatCountdown(remainingMs) : "0s"}
      </p>
    </div>
  );
}
