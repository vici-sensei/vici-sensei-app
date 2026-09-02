"use client";

import { useUserBadges } from "@/lib/client-data/badges";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { BadgeCard, BadgeCardSkeleton } from "@/app/components/ui/BadgeCard";
import { FaMedal } from "react-icons/fa6";

export function BadgesSection({ userId }: { userId: string }) {
  const { data: badges, status } = useUserBadges(userId);

  return (
    <GlassCard padding="lg">
      <h3 className="mb-4 text-[1.05rem] font-bold text-white">Badges</h3>
      {status === "loading" ? (
        <div className="flex flex-col gap-3">
          <BadgeCardSkeleton />
          <BadgeCardSkeleton />
        </div>
      ) : !badges || badges.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 py-6 text-center">
          <FaMedal className="h-6 w-6 text-text-muted" />
          <p className="text-[0.85rem] leading-[1.6] text-text-muted">
            No badges yet — complete a reading test to earn your first one.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {badges.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}
