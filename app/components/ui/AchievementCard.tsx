"use client";

import { useState, type SyntheticEvent } from "react";
import Image from "next/image";
import { FaXmark } from "react-icons/fa6";
import type { AchievementCatalogEntry } from "@/lib/achievements/registry";
import { achievementImageSrc } from "@/lib/achievements/badgeImages";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Modal } from "@/app/components/ui/Modal";

/** How big the enlarged artwork gets in the list view (BadgeArt) -- capped by viewport width so
 * it never overflows a narrow phone screen. */
const ENLARGED_SIZE_CLASS = "w-72 max-w-[85vw]";

function naturalRatio(event: SyntheticEvent<HTMLImageElement>): number {
  const { naturalWidth, naturalHeight } = event.currentTarget;
  return naturalHeight > 0 ? naturalWidth / naturalHeight : 1;
}

interface BadgeArtProps {
  entry: AchievementCatalogEntry;
  enlarged: boolean;
  onEnlarge: () => void;
  onShrink: () => void;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

/** Shows a badge's artwork if one has been assigned (see lib/achievements/badgeImages.ts),
 * falling back to its react-icons icon otherwise -- either because no filename has been set yet
 * (no image ever attempted, so no doomed network request) or because the assigned file failed to
 * load (same "onError swaps to a fallback" pattern as ProfileMenu.tsx's Avatar).
 *
 * Clicking a loaded image enlarges it in place -- no modal, no overlay -- at its own natural
 * aspect ratio (not the small circle's forced 1:1 crop) with a small border radius instead of
 * rounded-full. AchievementCard/LockedAchievementCard own the `enlarged` boolean and switch their
 * own layout to a column when it's true, so the card just grows to fit the bigger image instead
 * of anything floating above the page.
 *
 * It's one persistent element throughout (never conditionally swapped for a differently-shaped
 * one), with `transition-all` animating its size and `aspect-ratio` animating from a forced 1/1
 * (the small circle) to the image's own ratio -- read once via `onLoad` off the underlying <img>,
 * since neither is known until the file actually loads.
 *
 * `borderRadius` is an inline style, not Tailwind's rounded-full/rounded-lg classes, because
 * Tailwind's rounded-full is a fixed 9999px: transitioning 9999px -> 8px stays visually "fully
 * round" for nearly the whole 300ms (any radius >= half the box's own side still clips to a
 * circle) and only resolves to a rectangle in the last instant, reading as a snap instead of a
 * transition. Explicit numbers scaled to this box (22px = exactly half of the 44px collapsed
 * size, i.e. still a perfect circle, down to 12px) interpolate across the whole duration instead.
 *
 * The image itself lives in its own absolutely-positioned `overflow-hidden` wrapper, a sibling of
 * the close/enlarge button rather than their shared parent -- the button deliberately sits half
 * outside the artwork's own edge (`-right-2 -top-2`), so it can't be on the element that clips to
 * that edge or overflow-hidden would cut it off too. `rounded-[inherit]` keeps that wrapper's own
 * corners following the outer element's animated radius without duplicating the conditional.
 *
 * A close "x" in the corner shrinks it back -- the enlarged image itself isn't clickable to
 * shrink (an invisible full-cover button only exists while collapsed), so an accidental second
 * click on the now much-bigger image doesn't immediately re-collapse it. */
function BadgeArt({ entry, enlarged, onEnlarge, onShrink, borderClass, bgClass, textClass }: BadgeArtProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [ratio, setRatio] = useState(1);
  const Icon = entry.icon;
  const src = achievementImageSrc(entry.achievementKey);

  if (!src || imageFailed) {
    return (
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${borderClass} ${bgClass} text-lg ${textClass}`}
      >
        <Icon />
      </span>
    );
  }

  return (
    <span
      className={`relative block shrink-0 border transition-all duration-300 ease-in-out ${borderClass} ${
        enlarged ? `${ENLARGED_SIZE_CLASS} self-start` : "h-11 w-11"
      }`}
      style={{ aspectRatio: enlarged ? ratio : 1, borderRadius: enlarged ? 12 : 22 }}
    >
      <span className={`absolute inset-0 overflow-hidden rounded-[inherit] ${bgClass}`}>
        <Image
          src={src}
          alt=""
          fill
          sizes={enlarged ? "288px" : "44px"}
          className={enlarged ? "object-contain" : "object-cover"}
          onLoad={(event) => setRatio(naturalRatio(event))}
          onError={() => setImageFailed(true)}
        />
      </span>
      {enlarged ? (
        <button
          type="button"
          onClick={onShrink}
          aria-label={`Shrink ${entry.title} image`}
          className="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white hover:bg-black"
        >
          <FaXmark className="text-xl" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onEnlarge}
          aria-label={`Enlarge ${entry.title} image`}
          className="absolute inset-0 cursor-zoom-in"
        />
      )}
    </span>
  );
}

/** Earned entry from ACHIEVEMENT_CATALOG (lib/achievements/registry.tsx). Gold styling always --
 * an achievement is a one-time, permanent unlock (see public.user_achievements), so there's no
 * in-progress/complete distinction to show blue for. */
export function AchievementCard({ entry }: { entry: AchievementCatalogEntry }) {
  const [enlarged, setEnlarged] = useState(false);

  return (
    <div
      className={`flex gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5 ${enlarged ? "flex-col" : "items-center"}`}
    >
      <BadgeArt
        entry={entry}
        enlarged={enlarged}
        onEnlarge={() => setEnlarged(true)}
        onShrink={() => setEnlarged(false)}
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
 * grayscale/opacity filter on this wrapper applies to BadgeArt's image too, not just the icon
 * fallback, so a locked badge's artwork (enlarged or not) automatically desaturates once it
 * exists. */
export function LockedAchievementCard({ entry }: { entry: AchievementCatalogEntry }) {
  const [enlarged, setEnlarged] = useState(false);

  return (
    <div
      className={`flex gap-3.5 rounded-xl border border-border-soft bg-white/[0.02] px-4 py-3.5 opacity-40 grayscale ${enlarged ? "flex-col" : "items-center"}`}
    >
      <BadgeArt
        entry={entry}
        enlarged={enlarged}
        onEnlarge={() => setEnlarged(true)}
        onShrink={() => setEnlarged(false)}
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
 * text-free overview). Clicking it opens a Modal with the full image, title, and description
 * instead of BadgeArt's inline grow -- the grid packs cells edge to edge, so there's no room to
 * grow one in place without it fighting its neighbors for space; a modal sidesteps that
 * entirely, and it's the only place in this file that needs the title/description at all. */
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
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg ${toneClasses}`}
      >
        <Icon />
      </span>
    );
  }

  const modalTitleId = `badge-modal-title-${entry.achievementKey}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        aria-label={`View ${entry.title}`}
        className={`relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border text-lg ${toneClasses}`}
      >
        <Image src={src} alt="" fill sizes="44px" className="object-cover" onError={() => setImageFailed(true)} />
      </button>
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} labelledBy={modalTitleId} showCloseButton>
          <div className="flex flex-col items-center text-center">
            <span
              className={`relative mb-4 block w-full max-h-[60vh] max-w-[220px] overflow-hidden rounded-2xl border ${
                earned ? "border-accent-gold/30" : "border-border-soft opacity-40 grayscale"
              }`}
            >
              <Image
                src={src}
                alt=""
                width={600}
                height={600}
                sizes="220px"
                className="h-auto w-full rounded-2xl object-contain"
                onError={() => setImageFailed(true)}
              />
            </span>
            <h3 id={modalTitleId} className="mb-1.5 text-lg font-extrabold text-white">
              {entry.title}
            </h3>
            <p className="text-[0.85rem] leading-normal text-text-muted">
              {earned ? entry.description : entry.lockedDescription}
            </p>
          </div>
        </Modal>
      )}
    </>
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
