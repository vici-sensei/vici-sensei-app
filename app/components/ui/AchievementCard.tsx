"use client";

import { useState } from "react";
import Image from "next/image";
import type { AchievementCatalogEntry } from "@/lib/achievements/registry";
import { achievementImageSrc } from "@/lib/achievements/badgeImages";
import { Skeleton } from "@/app/components/ui/Skeleton";

/** Shows a badge's artwork if one has been assigned (see lib/achievements/badgeImages.ts),
 * falling back to its react-icons icon otherwise -- either because no filename has been set yet
 * (no image ever attempted, so no doomed network request) or because the assigned file failed to
 * load (same "onError swaps to a fallback" pattern as ProfileMenu.tsx's Avatar). */
function BadgeArt({ entry }: { entry: AchievementCatalogEntry }) {
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = entry.icon;
  const src = achievementImageSrc(entry.achievementKey);

  if (!src || imageFailed) return <Icon />;

  return <Image src={src} alt="" fill sizes="44px" className="object-cover" onError={() => setImageFailed(true)} />;
}

/** Earned entry from ACHIEVEMENT_CATALOG (lib/achievements/registry.tsx). Gold styling always --
 * an achievement is a one-time, permanent unlock (see public.user_achievements), so there's no
 * in-progress/complete distinction to show blue for. */
export function AchievementCard({ entry }: { entry: AchievementCatalogEntry }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-accent-gold/30 bg-accent-gold/10 text-lg text-accent-gold">
        <BadgeArt entry={entry} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[0.9rem] font-bold text-white">{entry.title}</div>
        <div className="mt-0.5 text-[0.8rem] text-text-muted">{entry.description}</div>
      </div>
    </div>
  );
}

/** Not-yet-earned entry from ACHIEVEMENT_CATALOG -- same layout as AchievementCard, greyscale and
 * faded so the full trophy case reads as "locked" rather than as an error or an earned badge. The
 * grayscale/opacity filter on this wrapper applies to BadgeArt's image too, not just the icon
 * fallback, so a locked badge's artwork automatically desaturates once it exists. */
export function LockedAchievementCard({ entry }: { entry: AchievementCatalogEntry }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5 opacity-40 grayscale">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-soft text-lg text-text-muted">
        <BadgeArt entry={entry} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[0.9rem] font-bold text-white">{entry.title}</div>
        <div className="mt-0.5 text-[0.8rem] text-text-muted">{entry.lockedDescription}</div>
      </div>
    </div>
  );
}

export function AchievementCardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5">
      <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}
