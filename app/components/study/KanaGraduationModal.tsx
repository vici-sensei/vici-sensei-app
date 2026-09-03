"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
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

/** Copy for the two "you just mastered a script, go take its reading test" kinds -- everything
 * 'katakana_complete' (the actual move to standard) needs is different enough (no test to start,
 * no "Later" escape) that it's handled as its own branch below instead of a third entry here. */
const READING_TEST_COPY: Record<"hiragana_complete" | "katakana_mastered", {
  badgeLabel: string;
  title: string;
  body: React.ReactNode;
  testPath: string;
}> = {
  hiragana_complete: {
    badgeLabel: "Hiragana mastered",
    title: "Hiragana mastered!",
    body: (
      <>
        You&apos;ve just finished every hiragana character! Before <strong className="text-white">katakana</strong>{" "}
        unlocks, take a quick reading test to make sure everything stuck — it&apos;s a short list of words written
        entirely in hiragana.
      </>
    ),
    testPath: "/study/test/hiragana",
  },
  katakana_mastered: {
    badgeLabel: "Katakana mastered",
    title: "Katakana mastered!",
    body: (
      <>
        You&apos;ve just finished every katakana character too! Before{" "}
        <strong className="text-white">kanji and vocabulary</strong> unlock, take a quick reading test to make sure
        everything stuck — it&apos;s a short list of loanwords written entirely in katakana.
      </>
    ),
    testPath: "/study/test/katakana",
  },
};

export function KanaGraduationModal({ kind, onClose }: KanaGraduationModalProps) {
  const router = useRouter();

  // Fires once per mount -- a fresh `kind` always means a brand new modal instance (the page
  // only ever renders this when a result is non-null), never a re-render of the same one.
  useEffect(() => {
    void celebrate();
  }, []);

  if (kind === "katakana_complete") {
    return (
      <Modal onClose={onClose} labelledBy="kana-graduation-title">
        <div className="text-center">
          <Badge color="gold">
            <span className="inline-flex items-center gap-1.5">
              <FaGraduationCap className="h-3 w-3" />
              Kana complete
            </span>
          </Badge>

          <h3 id="kana-graduation-title" className="mb-2 mt-4.5 text-[1.5rem] font-extrabold leading-[1.25]">
            You&apos;ve completed kana!
          </h3>

          <p className="text-[0.9rem] leading-[1.6] text-text-muted">
            You&apos;ve just finished every hiragana <strong className="text-white">and</strong> katakana character,
            and passed both reading tests — that&apos;s the whole kana curriculum! You&apos;re moving on to{" "}
            <strong className="text-white">kanji and vocabulary</strong> now, starting at N5. You can always switch
            back to kana anytime in Settings.
          </p>

          <Button className="mt-7 w-full" onClick={onClose}>
            Continue
          </Button>
        </div>
      </Modal>
    );
  }

  const { badgeLabel, title, body, testPath } = READING_TEST_COPY[kind];
  return (
    <Modal onClose={onClose} labelledBy="kana-graduation-title">
      <div className="text-center">
        <Badge color="gold">
          <span className="inline-flex items-center gap-1.5">
            <FaUnlock className="h-3 w-3" />
            {badgeLabel}
          </span>
        </Badge>

        <h3 id="kana-graduation-title" className="mb-2 mt-4.5 text-[1.5rem] font-extrabold leading-[1.25]">
          {title}
        </h3>

        <p className="text-[0.9rem] leading-[1.6] text-text-muted">{body}</p>

        <div className="mt-7 flex flex-col gap-3">
          <Button
            className="w-full"
            onClick={() => {
              onClose();
              router.push(testPath);
            }}
          >
            Start the test
          </Button>
          <Button variant="secondary" className="w-full" onClick={onClose}>
            Later
          </Button>
        </div>
      </div>
    </Modal>
  );
}
