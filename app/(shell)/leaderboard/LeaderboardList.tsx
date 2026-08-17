"use client";

import { useState } from "react";
import Image from "next/image";
import { FaMedal, FaUser } from "react-icons/fa6";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ProBadge } from "@/app/components/ui/ProBadge";
import { avatarSrc } from "@/lib/avatar";
import type { LeaderboardEntry, LeaderboardMetric } from "@/lib/types";

const MEDAL_COLORS: Record<number, string> = {
  1: "var(--color-accent-gold)",
  2: "#c0c0c0",
  3: "#cd7f32",
};

const METRIC_COLORS: Record<LeaderboardMetric, string> = {
  reviews: "var(--color-accent-blue)",
  new_cards: "var(--color-accent-violet)",
  streak: "var(--color-accent-gold)",
  xp: "var(--color-accent-orange)",
};

function formatScoreParts(metric: LeaderboardMetric, score: number): { value: string; unit: string } {
  switch (metric) {
    case "reviews":
      return { value: String(score), unit: score === 1 ? "review" : "reviews" };
    case "new_cards":
      return { value: String(score), unit: score === 1 ? "new card" : "new cards" };
    case "streak":
      return { value: String(score), unit: score === 1 ? "day" : "days" };
    case "xp":
      return { value: String(score), unit: "XP" };
  }
}

function LeaderboardAvatar({
  avatarUrl,
  isPremium,
}: {
  avatarUrl: string | null;
  isPremium: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showAvatar = Boolean(avatarUrl) && !failed;
  return (
    <div className="relative h-10 w-10 mr-1.5 shrink-0">
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 text-[0.85rem] font-extrabold text-white">
        {showAvatar ? (
          <Image
            src={avatarSrc(avatarUrl as string, 96)}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <FaUser className="h-[45%] w-[45%]" />
        )}
      </div>
      {isPremium ? <ProBadge className="-top-2.5 -right-1.5" /> : null}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <div
        className="flex h-9 shrink-0 items-center justify-center text-xl"
        style={{ color: MEDAL_COLORS[rank] }}
      >
        <FaMedal />
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center text-[0.95rem] font-bold text-text-muted">
      {rank}
    </div>
  );
}

export function LeaderboardList({
  entries,
  status,
  metric,
  viewerId,
}: {
  entries: LeaderboardEntry[];
  status: "loading" | "loaded" | "error";
  metric: LeaderboardMetric;
  viewerId: string | undefined;
}) {
  if (status === "loading") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <GlassCard padding="lg" className="text-center text-text-muted">
        Couldn&apos;t load the leaderboard. Try again later.
      </GlassCard>
    );
  }

  if (entries.length === 0) {
    return (
      <GlassCard padding="lg" className="text-center text-text-muted">
        No results for this period yet. Be the first!
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="sm" className="flex flex-col gap-1">
      {entries.map((entry) => {
        const isViewer = entry.user_id === viewerId;
        const { value, unit } = formatScoreParts(metric, entry.score);
        return (
          <div key={entry.user_id}>
            <div
              className={`grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border p-3 ${
                isViewer ? "border-accent-red bg-accent-red/10" : "border-transparent bg-white/[0.025]"
              }`}
            >
              <div className="">
                <div className="float-left mr-3.5 flex items-center gap-3.5">
                  <RankBadge rank={entry.rank} />
                  <LeaderboardAvatar avatarUrl={entry.avatar_url} isPremium={entry.is_premium} />
                  {entry.country ? (
                    <div
                      aria-label={entry.country}
                      className={`fi fi-${entry.country.toLowerCase()} shrink-0 rounded-[2px] ring-1 ring-white/10`}
                    />
                  ) : null}
                </div>
                <p className="text-[0.92rem] font-bold leading-10 text-white">
                  {entry.display_name?.trim() || "Anonymous user"}
                </p>
              </div>
              <span
                className="inline-flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-3.5 py-1.5"
                style={{ backgroundColor: `${METRIC_COLORS[metric]}1f`, color: METRIC_COLORS[metric] }}
              >
                <b className="text-[0.95rem] font-extrabold leading-none tabular-nums">{value}</b>
                <span className="text-[0.58rem] font-bold uppercase tracking-wider opacity-80">{unit}</span>
              </span>
            </div>
          </div>
        );
      })}
    </GlassCard>
  );
}
