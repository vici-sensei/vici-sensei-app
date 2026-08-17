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

function formatScore(metric: LeaderboardMetric, score: number): string {
  switch (metric) {
    case "reviews":
      return `${score} review${score === 1 ? "" : "s"}`;
    case "new_cards":
      return `${score} new card${score === 1 ? "" : "s"}`;
    case "streak":
      return `${score} day${score === 1 ? "" : "s"}`;
    case "xp":
      return `${score} XP`;
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
    <div className="relative h-10 w-10 shrink-0">
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
      {isPremium ? <ProBadge className="-top-1.5 -right-1.5" /> : null}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center text-xl"
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
        return (
          <div key={entry.user_id}>
            <div
              className={`flex flex-wrap items-center gap-3.5 rounded-xl border px-3 py-3 ${
                isViewer ? "border-accent-red bg-accent-red/10" : "border-transparent"
              }`}
            >
              <RankBadge rank={entry.rank} />
              <LeaderboardAvatar avatarUrl={entry.avatar_url} isPremium={entry.is_premium} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[0.92rem] font-bold text-white">
                  {entry.country ? (
                    <span
                      aria-label={entry.country}
                      className={`fi fi-${entry.country.toLowerCase()} shrink-0 rounded-[2px] ring-1 ring-white/10`}
                    />
                  ) : null}
                  {entry.display_name?.trim() || "Anonymous user"}
                </p>
              </div>
              <div className="shrink-0 text-[0.92rem] font-extrabold tabular-nums text-white">
                {formatScore(metric, entry.score)}
              </div>
            </div>
          </div>
        );
      })}
    </GlassCard>
  );
}
