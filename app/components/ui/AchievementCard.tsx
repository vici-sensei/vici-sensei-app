"use client";

import { useState } from "react";
import Image from "next/image";
import { FaLock } from "react-icons/fa6";
import type { AchievementCatalogEntry } from "@/lib/achievements/registry";
import { achievementImageSrc } from "@/lib/achievements/badgeImages";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Modal } from "@/app/components/ui/Modal";

/** Circle size for a badge's thumbnail -- shared by the list view (BadgeArt) and the grid view
 * (GridBadgeIcon) so both grow together. 4rem/64px, up from an earlier 2.75rem/44px that read as
 * too small to tap or even make out on a phone. */
const CIRCLE_SIZE_CLASS = "h-16 w-16";

/** Clicking a badge's circle -- in either the list or grid view -- opens this same full-screen
 * modal with the badge's full artwork, title, and description. A small inline "enlarge in place"
 * used to exist just for the list view, but a phone-sized card has no room to grow an image into
 * without cramping everything around it, so both views now go through this instead. `max-w-full`
 * on the image (plus a `max-h` cap) is what actually keeps it from overflowing a narrow screen --
 * it's an intrinsic-sized <Image>, not a `fill` one, precisely so those two classes are enough. */
function BadgeImageModal({
  entry,
  earned,
  src,
  onClose,
}: {
  entry: AchievementCatalogEntry;
  earned: boolean;
  src: string;
  onClose: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = entry.icon;
  const modalTitleId = `badge-modal-title-${entry.achievementKey}`;

  return (
    <Modal onClose={onClose} labelledBy={modalTitleId} showCloseButton fullScreen>
      <div className="flex h-full w-full items-center justify-center">
        {/* The one actual content box -- image + title + description -- sized to fit its own
         * content (not stretched to the full-screen parent) and marked as a single zone that
         * stops a click from bubbling up to the dialog's own outside-click-closes handler in
         * Modal.tsx. Everything outside this box (the empty flex space around it) still closes
         * the modal, matching what a lightbox is expected to do. */}
        <div
          className="flex h-fit flex-col items-center gap-5 text-center"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="relative">
            {imageFailed ? (
              <Icon className={`text-8xl ${earned ? "text-accent-gold" : "text-text-muted grayscale"}`} />
            ) : (
              <Image
                src={src}
                alt=""
                width={800}
                height={800}
                sizes="100vw"
                className={`max-h-[60vh] w-auto max-w-full object-contain ${earned ? "" : "grayscale"}`}
                onError={() => setImageFailed(true)}
              />
            )}
            {!earned && (
              // Sized as a fraction of the image's own box (h-1/2 w-1/2 of this wrapper, which
              // matches the rendered image exactly), not a fixed rem value -- a fixed size looked
              // right against a large desktop image but badly overflowed a small one. The SVG's
              // own default preserveAspectRatio (xMidYMid meet) keeps the glyph itself undistorted
              // and centered within that box even though the box isn't square. The dark
              // drop-shadow gives it a halo so it still reads against both light and dark regions
              // of the artwork, not just one.
              <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <FaLock
                  aria-hidden="true"
                  className="h-full w-full text-gray-300/70 drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]"
                />
              </div>
            )}
          </div>
          <div className="max-w-[440px] px-4">
            <h3 id={modalTitleId} className="mx-auto mb-1.5 w-fit cursor-text text-lg font-extrabold text-white">
              {entry.title}
            </h3>
            <p className="cursor-text text-[0.85rem] leading-normal text-text-muted">
              {earned ? entry.description : entry.lockedDescription}
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface BadgeArtProps {
  entry: AchievementCatalogEntry;
  earned: boolean;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

/** Shows a badge's artwork if one has been assigned (see lib/achievements/badgeImages.ts),
 * falling back to its react-icons icon otherwise -- either because no filename has been set yet
 * (no image ever attempted, so no doomed network request) or because the assigned file failed to
 * load (same "onError swaps to a fallback" pattern as ProfileMenu.tsx's Avatar). Tapping a loaded
 * image opens BadgeImageModal with the full-size artwork. */
function BadgeArt({ entry, earned, borderClass, bgClass, textClass }: BadgeArtProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const Icon = entry.icon;
  const src = achievementImageSrc(entry.achievementKey);

  if (!src || imageFailed) {
    return (
      <span
        className={`flex ${CIRCLE_SIZE_CLASS} shrink-0 items-center justify-center rounded-full border ${borderClass} ${bgClass} text-2xl ${textClass}`}
      >
        <Icon />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={`View ${entry.title} image`}
        className={`relative flex ${CIRCLE_SIZE_CLASS} shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-full border ${borderClass} ${bgClass}`}
      >
        <Image src={src} alt="" fill sizes="64px" className="object-cover" onError={() => setImageFailed(true)} />
      </button>
      {modalOpen && (
        <BadgeImageModal entry={entry} earned={earned} src={src} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

/** Earned entry from ACHIEVEMENT_CATALOG (lib/achievements/registry.tsx). Gold styling always --
 * an achievement is a one-time, permanent unlock (see public.user_achievements), so there's no
 * in-progress/complete distinction to show blue for. */
export function AchievementCard({ entry }: { entry: AchievementCatalogEntry }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5">
      <BadgeArt
        entry={entry}
        earned
        borderClass="border-accent-gold/30"
        bgClass="bg-accent-gold/10"
        textClass="text-accent-gold"
      />
      <div className="min-w-0">
        <div className="truncate text-[0.9rem] font-bold text-white">{entry.title}</div>
        <div className="mt-0.5 text-[0.8rem] text-text-muted">{entry.description}</div>
      </div>
    </div>
  );
}

/** Not-yet-earned entry from ACHIEVEMENT_CATALOG -- same layout as AchievementCard, greyscale and
 * faded so the full trophy case reads as "locked" rather than as an error or an earned badge. The
 * grayscale/opacity filter on this wrapper applies to BadgeArt's thumbnail image too, not just the
 * icon fallback, so a locked badge's artwork automatically desaturates once it exists. Its
 * full-screen modal is rendered through a portal (see Modal's `fullScreen`), so it escapes this
 * wrapper's filter/opacity instead of rendering washed-out itself. */
export function LockedAchievementCard({ entry }: { entry: AchievementCatalogEntry }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5 opacity-40 grayscale">
      <BadgeArt
        entry={entry}
        earned={false}
        borderClass="border-border-soft"
        bgClass="bg-white/[0.02]"
        textClass="text-text-muted"
      />
      <div className="min-w-0">
        <div className="truncate text-[0.9rem] font-bold text-white">{entry.title}</div>
        <div className="mt-0.5 text-[0.8rem] text-text-muted">{entry.lockedDescription}</div>
      </div>
    </div>
  );
}

/** Circle for the grid view (BadgesSection's grid/list toggle) -- same artwork-with-icon-fallback
 * as BadgeArt, minus the title/description next to it (that view's whole point is a compact,
 * text-free overview). Tapping it opens the same BadgeImageModal as the list view. */
export function GridBadgeIcon({ entry, earned }: { entry: AchievementCatalogEntry; earned: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const Icon = entry.icon;
  const src = achievementImageSrc(entry.achievementKey);
  const toneClasses = earned
    ? "border-accent-gold/30 bg-accent-gold/10 text-accent-gold"
    : "border-border-soft bg-white/[0.02] text-text-muted opacity-40 grayscale";

  if (!src || imageFailed) {
    return (
      <span
        aria-label={entry.title}
        className={`flex ${CIRCLE_SIZE_CLASS} shrink-0 items-center justify-center rounded-full border text-2xl ${toneClasses}`}
      >
        <Icon />
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={`View ${entry.title}`}
        className={`relative flex ${CIRCLE_SIZE_CLASS} shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-2xl ${toneClasses}`}
      >
        <Image src={src} alt="" fill sizes="64px" className="object-cover" onError={() => setImageFailed(true)} />
      </button>
      {modalOpen && (
        <BadgeImageModal entry={entry} earned={earned} src={src} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

export function AchievementCardSkeleton() {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5">
      <Skeleton className={`${CIRCLE_SIZE_CLASS} shrink-0 rounded-full`} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}
