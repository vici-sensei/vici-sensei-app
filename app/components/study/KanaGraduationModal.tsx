"use client";

import { useEffect } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { celebrate } from "@/lib/confetti";
import type { KanaGraduationKind } from "@/lib/types";
import { FaGraduationCap, FaUnlock } from "react-icons/fa6";

interface KanaGraduationModalProps {
  kind: KanaGraduationKind;
  onClose: () => void;
}

export function KanaGraduationModal({ kind, onClose }: KanaGraduationModalProps) {
  const isKatakanaComplete = kind === "katakana_complete";

  // Fires once per mount -- a fresh `kind` always means a brand new modal instance (the page
  // only ever renders this when a result is non-null), never a re-render of the same one.
  useEffect(() => {
    void celebrate();
  }, []);

  return (
    <Modal onClose={onClose} labelledBy="kana-graduation-title">
      <div className="text-center">
        <Badge color="gold">
          <span className="inline-flex items-center gap-1.5">
            {isKatakanaComplete ? <FaGraduationCap className="h-3 w-3" /> : <FaUnlock className="h-3 w-3" />}
            {isKatakanaComplete ? "Kana complete" : "Katakana unlocked"}
          </span>
        </Badge>

        <h3 id="kana-graduation-title" className="mb-2 mt-4.5 text-[1.5rem] font-extrabold leading-[1.25]">
          {isKatakanaComplete ? "You've completed kana!" : "Hiragana mastered!"}
        </h3>

        <p className="text-[0.9rem] leading-[1.6] text-text-muted">
          {isKatakanaComplete ? (
            <>
              You&apos;ve just finished every hiragana <strong className="text-white">and</strong> katakana character —
              that&apos;s the whole kana curriculum! You&apos;re moving on to{" "}
              <strong className="text-white">kanji and vocabulary</strong> now, starting at N5. You can always switch
              back to kana anytime in Settings.
            </>
          ) : (
            <>
              You&apos;ve just finished every hiragana character! <strong className="text-white">Katakana</strong> is
              now unlocked, so you&apos;ll start seeing new katakana characters in your queue. You can always turn it
              back off in Settings if you&apos;d like more time on hiragana first.
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
