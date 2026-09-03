import type { UserBadge } from "@/lib/types";
import { describeBadge, type BadgeCatalogEntry } from "@/lib/badges/registry";
import { Skeleton } from "@/app/components/ui/Skeleton";

export function BadgeCard({ badge }: { badge: UserBadge }) {
  const { icon: Icon, title, description, complete } = describeBadge(badge);
  const toneClasses = complete
    ? "border-accent-gold/30 bg-accent-gold/10 text-accent-gold"
    : "border-accent-blue/30 bg-accent-blue/10 text-accent-blue";

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg ${toneClasses}`}>
        <Icon />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[0.9rem] font-bold text-white">{title}</div>
        <div className="mt-0.5 text-[0.8rem] text-text-muted">{description}</div>
      </div>
    </div>
  );
}

/** Not-yet-earned entry from the badge catalog -- same layout as BadgeCard, greyscale and faded
 * so the full trophy case reads as "locked" rather than as an error or an earned badge. */
export function LockedBadgeCard({ entry }: { entry: BadgeCatalogEntry }) {
  const Icon = entry.icon;

  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5 opacity-40 grayscale">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-soft text-lg text-text-muted">
        <Icon />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[0.9rem] font-bold text-white">{entry.title}</div>
        <div className="mt-0.5 text-[0.8rem] text-text-muted">{entry.lockedDescription}</div>
      </div>
    </div>
  );
}

export function BadgeCardSkeleton() {
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
