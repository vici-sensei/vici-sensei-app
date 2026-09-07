"use client";

import { useEffect } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { AchievementCard } from "@/app/components/ui/AchievementCard";
import { celebrate } from "@/lib/confetti";
import type { AchievementCatalogEntry } from "@/lib/achievements/registry";
import { FaTrophy } from "react-icons/fa6";

interface NewAchievementsModalProps {
  entries: AchievementCatalogEntry[];
  onClose: () => void;
}

/** Shown once, right after a study session/reading test ends, for whatever achievements got
 * newly unlocked during it (see lib/study/newAchievements.ts and the per-test-type earned-since
 * lookups) -- otherwise the only way to ever see a fresh unlock is to open Settings > Profile >
 * Badges. Visual pattern matches KanaGraduationModal: same non-fullScreen Modal, one-shot confetti
 * on mount (a fresh `entries` list always means a brand new modal instance, never a re-render of
 * the same one), single "Continue" CTA. */
export function NewAchievementsModal({ entries, onClose }: NewAchievementsModalProps) {
  useEffect(() => {
    void celebrate();
  }, []);

  if (entries.length === 0) return null;

  const plural = entries.length > 1;

  return (
    <Modal onClose={onClose} labelledBy="new-achievements-title">
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

        <Button className="mt-7 w-full" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}
