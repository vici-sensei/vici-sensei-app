"use client";

import { useUserBadges } from "@/lib/client-data/badges";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { BadgeCard, BadgeCardSkeleton, LockedBadgeCard } from "@/app/components/ui/BadgeCard";
import { BADGE_CATALOG } from "@/lib/badges/registry";

export function BadgesSection({ userId }: { userId: string }) {
  const { data: badges, status } = useUserBadges(userId);

  return (
    <GlassCard padding="lg">
      <h3 className="mb-4 text-[1.05rem] font-bold text-white">Badges</h3>
      <div className="flex flex-col gap-3">
        {status === "loading"
          ? BADGE_CATALOG.map((entry) => <BadgeCardSkeleton key={entry.badgeKey} />)
          : BADGE_CATALOG.map((entry) => {
              const earned = badges?.find((badge) => badge.badge_key === entry.badgeKey);
              return earned ? (
                <BadgeCard key={entry.badgeKey} badge={earned} />
              ) : (
                <LockedBadgeCard key={entry.badgeKey} entry={entry} />
              );
            })}
      </div>
    </GlassCard>
  );
}
