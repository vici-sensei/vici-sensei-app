"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Modal } from "@/app/components/ui/Modal";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { celebrate } from "@/lib/confetti";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements/registry";
import { achievementImageSrc } from "@/lib/achievements/badgeImages";
import { FaMedal } from "react-icons/fa6";

interface AchievementEarnedModalProps {
  achievementKey: string;
  onClose: () => void;
}

/** Celebrates one achievement_key just returned by submit_review's new_achievement_keys (see
 * 20261015_submit_review_returns_new_achievements.sql) -- StudyPage renders this whenever
 * useStudyQueue's achievement queue is non-empty, ahead of JlptLevelUpModal/KanaGraduationModal
 * (its queue always drains first -- see StudyPage's render order), and onClose (dismissAchievement)
 * advances to the next queued key, if any, instead of just closing.
 *
 * Title/description come straight from ACHIEVEMENT_CATALOG (lib/achievements/registry.tsx) -- the
 * same copy BadgesSection already shows in Settings > Profile, so this never needs its own copy
 * to maintain. The image, same source and fallback-to-icon behavior as AchievementCard's BadgeArt,
 * is just forced to a plain circle here (no enlarge-in-place) since this modal already has its own
 * close affordance and isn't meant to linger. */
export function AchievementEarnedModal({ achievementKey, onClose }: AchievementEarnedModalProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const entry = ACHIEVEMENT_CATALOG.find((e) => e.achievementKey === achievementKey);
  const src = entry ? achievementImageSrc(entry.achievementKey) : undefined;
  const Icon = entry?.icon ?? FaMedal;

  // Fires once per mount -- a fresh `achievementKey` always means a brand new modal instance
  // (StudyPage only ever renders this when the queue's head is non-null), never a re-render of
  // the same one.
  useEffect(() => {
    void celebrate();
  }, []);

  // Defensive only: the DB can award a key before its catalog entry ships client-side (e.g. a new
  // achievement type added to evaluate_kanji_vocab_achievements ahead of its registry.tsx entry).
  // Skipping straight to onClose (rather than rendering a blank/broken modal) still advances
  // useStudyQueue's achievement queue to whatever's next.
  useEffect(() => {
    if (!entry) onClose();
  }, [entry, onClose]);
  if (!entry) return null;

  return (
    <Modal onClose={onClose} labelledBy="achievement-earned-title">
      <div className="text-center">
        <Badge color="gold">
          <span className="inline-flex items-center gap-1.5">
            <FaMedal className="h-3 w-3" />
            Achievement unlocked
          </span>
        </Badge>

        <div className="relative mx-auto mb-4 mt-5 h-24 w-24 shrink-0 overflow-hidden rounded-full border border-accent-gold/30 bg-accent-gold/10">
          {src && !imageFailed ? (
            <Image src={src} alt="" fill sizes="96px" className="object-cover" onError={() => setImageFailed(true)} />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl text-accent-gold">
              <Icon />
            </span>
          )}
        </div>

        <h3 id="achievement-earned-title" className="mb-2 text-[1.5rem] font-extrabold leading-[1.25]">
          {entry.title}
        </h3>

        <p className="text-[0.9rem] leading-[1.6] text-text-muted">{entry.description}</p>

        <Button className="mt-7 w-full" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}
