"use client";

import { useState } from "react";
import Image from "next/image";
import { FaMedal, FaUser } from "react-icons/fa6";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { ProBadge } from "@/app/components/ui/ProBadge";
import { useFlagIconsCss } from "@/app/components/ui/useFlagIconsCss";
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

// Plural label shown on a placeholder row -- the real score (and thus its singular/plural
// unit) isn't known until entries load, so a row's shape is filled in ahead of the data it
// describes rather than swapped in behind a generic skeleton block.
const METRIC_UNITS: Record<LeaderboardMetric, string> = {
  reviews: "reviews",
  new_cards: "new cards",
  streak: "days",
  xp: "XP",
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
        className="flex w-5 shrink-0 items-center justify-center text-xl"
        style={{ color: MEDAL_COLORS[rank] }}
      >
        <FaMedal />
      </div>
    );
  }
  return (
    <div className="flex w-5 shrink-0 items-center justify-center text-[0.95rem] font-bold text-text-muted">
      {rank}
    </div>
  );
}

function ScoreBadge({ metric, value, unit }: { metric: LeaderboardMetric; value: string; unit: string }) {
  return (
    <span
      className="inline-flex shrink-0 flex-col items-center gap-0.5 rounded-2xl px-3.5 py-1.5"
      style={{ backgroundColor: `${METRIC_COLORS[metric]}1f`, color: METRIC_COLORS[metric] }}
    >
      <b className="text-[0.95rem] font-extrabold leading-none tabular-nums">{value}</b>
      <span className="text-[0.58rem] font-bold uppercase tracking-wider opacity-80 text-center">{unit}</span>
    </span>
  );
}

// Sized to match the real `.fi` flag icons exactly (1.333333em x 1em, see
// flag-icons/css/flag-icons.min.css) rather than a guessed pixel size, so the placeholder
// occupies the identical box a real flag would.
function FlagPlaceholder() {
  return (
    <div className="flex h-[1em] w-[1.333333em] shrink-0 animate-pulse flex-col overflow-hidden rounded-[2px]">
      <div className="flex-1 bg-white/20" />
      <div className="flex-1 bg-white/12" />
      <div className="flex-1 bg-white/[0.06]" />
    </div>
  );
}

// A row is either a real entry, or a placeholder shown before entries have loaded. Rank order,
// score styling, and the metric's unit label are known ahead of the fetch, so a placeholder row
// renders those for real (score just reads 0) -- only the name and flag, which truly can't be
// guessed, fall back to a plain static gray shape (no pulse animation) standing in for "not
// loaded yet", the same way LeaderboardAvatar already renders a plain user icon in place of an
// unset avatar. Laid out with flex rather than the real row's float (below) so the name bar can
// simply flex-1 to fill whatever width the row has, instead of guessing a fixed width.
function LoadingRow({ rank, metric }: { rank: number; metric: LeaderboardMetric }) {
  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border border-transparent bg-white/[0.025] p-3">
        <div className="flex flex-wrap items-center gap-3.5">
          <RankBadge rank={rank} />
          <LeaderboardAvatar avatarUrl={null} isPremium={false} />
          <FlagPlaceholder />
          <span className="h-3.5 min-w-24 flex-1 animate-pulse rounded-md bg-white/10" />
        </div>
        <ScoreBadge metric={metric} value="0" unit={METRIC_UNITS[metric]} />
      </div>
    </div>
  );
}

function LeaderboardRow({
  entry,
  isViewer,
  viewerAnonymous,
  metric,
}: {
  entry: LeaderboardEntry;
  isViewer: boolean;
  viewerAnonymous: boolean;
  metric: LeaderboardMetric;
}) {
  const { value, unit } = formatScoreParts(metric, entry.score);

  return (
    <div>
      <div
        className={`grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl border p-3 ${
          isViewer ? "border-accent-red bg-accent-red/10" : "border-transparent bg-white/[0.025]"
        }`}
      >
        <div className="flex items-start gap-x-3.5">
          <div className="flex flex-wrap items-center gap-3.5">
            <RankBadge rank={entry.rank} />
            <LeaderboardAvatar avatarUrl={entry.avatar_url} isPremium={entry.is_premium} />
            {entry.country ? (
              <div
                aria-label={entry.country}
                className={`fi fi-${entry.country.toLowerCase()} shrink-0 rounded-[2px] ring-1 ring-white/10`}
              />
            ) : null}
          </div>
          <p className="min-w-24 flex-1 text-[0.92rem] font-bold leading-10 text-white">
            {entry.display_name?.trim() || "Anonymous user"}
            {isViewer && viewerAnonymous ? (
              <span className="ml-2 mb-1 inline-flex items-center gap-1 align-middle text-xs font-semibold text-accent-blue/70">
                (you)
              </span>
            ) : null}
          </p>
        </div>
        <ScoreBadge metric={metric} value={value} unit={unit} />
      </div>
    </div>
  );
}

export function LeaderboardList({
  entries,
  status,
  metric,
  viewerId,
  viewerAnonymous = false,
}: {
  entries: LeaderboardEntry[];
  status: "loading" | "loaded" | "error";
  metric: LeaderboardMetric;
  viewerId: string | undefined;
  /** Whether the viewer's own row is showing their random alias instead of their real name (settings' "Appear anonymously" toggle). */
  viewerAnonymous?: boolean;
}) {
  useFlagIconsCss();

  if (status === "loading") {
    return (
      <GlassCard padding="sm" className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <LoadingRow key={i} rank={i + 1} metric={metric} />
        ))}
      </GlassCard>
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
      {entries.map((entry) => (
        <LeaderboardRow
          key={entry.user_id}
          entry={entry}
          isViewer={entry.user_id === viewerId}
          viewerAnonymous={viewerAnonymous}
          metric={metric}
        />
      ))}
    </GlassCard>
  );
}
