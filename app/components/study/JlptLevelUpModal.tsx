"use client";

import { useEffect } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { celebrate } from "@/lib/confetti";
import type { JlptLevelUpResult } from "@/lib/types";
import { FaArrowRightLong, FaTrophy } from "react-icons/fa6";

interface JlptLevelUpModalProps {
  result: JlptLevelUpResult;
  onClose: () => void;
}

export function JlptLevelUpModal({ result, onClose }: JlptLevelUpModalProps) {
  // Fires once per mount -- a fresh `result` always means a brand new modal instance (the page
  // only ever renders this when result is non-null), never a re-render of the same one.
  useEffect(() => {
    void celebrate();
  }, []);

  return (
    <Modal onClose={onClose} labelledBy="level-up-title">
      <div className="text-center">
        <Badge color="gold">
          <span className="inline-flex items-center gap-1.5">
            <FaTrophy className="h-3 w-3" />
            {result.isMaxLevel ? "Full mastery" : "Level up"}
          </span>
        </Badge>

        <h3 id="level-up-title" className="mb-2 mt-4.5 text-[1.5rem] font-extrabold leading-[1.25]">
          {result.isMaxLevel ? "N1 mastered!" : "You leveled up!"}
        </h3>

        <div className="my-5 flex items-center justify-center gap-3">
          <LevelBadge level={result.completedLevel} size="lg" />
          {!result.isMaxLevel && (
            <>
              <FaArrowRightLong className="h-4 w-4 text-text-muted" />
              <LevelBadge level={result.newLevel} size="lg" />
            </>
          )}
        </div>

        <p className="text-[0.9rem] leading-[1.6] text-text-muted">
          {result.isMaxLevel ? (
            <>
              You&apos;ve just finished every kanji and vocabulary card for <strong className="text-white">N1</strong> —
              the highest JLPT level. That&apos;s incredible work!
            </>
          ) : (
            <>
              You&apos;ve just finished every kanji and vocabulary card for{" "}
              <strong className="text-white">{result.completedLevel}</strong>, so you&apos;ve moved up to{" "}
              <strong className="text-white">{result.newLevel}</strong>. {result.completedLevel} stays enabled, so
              you&apos;ll keep seeing its reviews too. You can always change your levels anytime in Settings.
            </>
          )}
        </p>

        <Button className="mt-7 w-full" onClick={onClose}>
          Continue
        </Button>
      </div>
    </Modal>
  );
}
