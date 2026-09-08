"use client";

import { Modal } from "@/app/components/ui/Modal";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { AchievementCard } from "@/app/components/ui/AchievementCard";
import { SakuraPetals } from "@/app/components/ui/SakuraPetals";
import type { AchievementCatalogEntry } from "@/lib/achievements/registry";
import { FaTrophy } from "react-icons/fa6";

interface NewAchievementsModalProps {
  entries: AchievementCatalogEntry[];
  onClose: () => void;
}

/** Shown right on top of the next card, the moment a review/drill submit unlocks an achievement
 * (useStudyQueue's newAchievements/dismissNewAchievements) -- otherwise the only way to ever see a
 * fresh unlock is to open Settings > Profile > Badges. /study/summary and the reading-test summary
 * pages render this same component as a fallback, for whatever stayed unacknowledged because this
 * mid-session moment never got the chance to show it (tab closed mid-session, etc) -- see
 * lib/data/achievements.ts's fetchUnacknowledgedAchievements/acknowledgeAchievements and the
 * per-test-type earned-since lookups. Visual pattern matches KanaGraduationModal: same
 * non-fullScreen Modal, single "Continue" CTA. Falling sakura petals (SakuraPetals, `fullScreen`)
 * replace a canvas-confetti burst, covering the whole viewport (not just this card) and painting
 * above it -- see SakuraPetals' own comment for why `position: fixed` reaches past this card's
 * bounds despite being nested inside it. */
export function NewAchievementsModal({ entries, onClose }: NewAchievementsModalProps) {
  if (entries.length === 0) return null;

  const plural = entries.length > 1;

  return (
    <Modal onClose={onClose} labelledBy="new-achievements-title">
      <SakuraPetals fullScreen />
      <div className="text-center">
        <Badge color="gold">
          <span className="inline-flex items-center gap-1.5">
            <FaTrophy className="h-3 w-3" />
            {plural ? "Achievements unlocked" : "Achievement unlocked"}
          </span>
        </Badge>

        <h3 id="new-achievements-title" className="mb-2 mt-4.5 text-[1.5rem] font-extrabold leading-[1.25]">
          {plural ? "New badges earned!" : "New badge earned!"}
        </h3>

        <div className="mt-5 flex max-h-[45vh] flex-col gap-2.5 overflow-y-auto text-left">
          {entries.map((entry) => (
            <AchievementCard key={entry.achievementKey} entry={entry} />
          ))}
        </div>

        <Button variant="secondary" size="sm" className="mt-7" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}
