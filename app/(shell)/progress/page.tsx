"use client";

import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useProgressSummary } from "@/lib/client-data/progress";
import { useStudySettings } from "@/lib/client-data/studySettings";
import type { ProgressSummaryResponse, ProgressStatusCounts } from "@/lib/types";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/srs/constants";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PiTranslate, PiSpeakerHigh, PiBookBookmark, PiTextAa, PiTextAUnderline } from "react-icons/pi";
import { StartStudyingLink } from "./StartStudyingLink";

const STATUS_COLORS: Record<ProgressStatus, string> = {
  new: "var(--color-text-muted)",
  learning: "var(--color-accent-blue)",
  review: "var(--color-accent-gold)",
  relearning: "var(--color-accent-red)",
  suspended: "#6b7280",
};

const STATUS_LABELS: Record<ProgressStatus, string> = {
  new: "New",
  learning: "Learning",
  review: "Review",
  relearning: "Relearning",
  suspended: "Suspended",
};

interface Block {
  key: keyof ProgressSummaryResponse;
  title: string;
  accent: string;
  icon: ReactNode;
}

const STANDARD_BLOCKS: Block[] = [
  {
    key: "kanji_meaning",
    title: "Kanji meaning",
    accent: "var(--color-accent-blue)",
    icon: <PiTranslate />,
  },
  {
    key: "kanji_reading",
    title: "Kanji reading",
    accent: "var(--color-accent-gold)",
    icon: <PiSpeakerHigh />,
  },
  {
    key: "vocab_meaning",
    title: "Vocabulary meaning",
    accent: "var(--color-accent-red)",
    icon: <PiBookBookmark />,
  },
];

const KANA_BLOCKS: Block[] = [
  {
    key: "hiragana_reading",
    title: "Hiragana reading",
    accent: "var(--color-accent-violet)",
    icon: <PiTextAa />,
  },
  {
    key: "katakana_reading",
    title: "Katakana reading",
    accent: "var(--color-accent-orange)",
    icon: <PiTextAUnderline />,
  },
];

function total(counts: ProgressStatusCounts): number {
  return PROGRESS_STATUSES.reduce((sum, s) => sum + counts[s], 0);
}

// Shown for each block before the real summary has loaded -- total(EMPTY_COUNTS) is 0, so a
// block reads as "0 total" with an empty bar rather than a skeleton.
const EMPTY_COUNTS: ProgressStatusCounts = { new: 0, learning: 0, review: 0, relearning: 0, suspended: 0 };

export default function ProgressPage() {
  const { user } = useAuth();
  const { data: summary } = useProgressSummary(user);
  const { data: settings } = useStudySettings(user);
  // On kana, only the two kana categories exist for the student to see. On standard, kanji and
  // vocabulary stay on top as today, with hiragana/katakana appended below as history -- kana
  // progress is never deleted when switching tracks, so it still deserves a place here.
  const BLOCKS: Block[] = settings?.study_track === "kana" ? KANA_BLOCKS : [...STANDARD_BLOCKS, ...KANA_BLOCKS];

  // grandTotal is only meaningful once summary has loaded -- kept at 0 (rather than computed
  // from EMPTY_COUNTS below) so the "no progress yet" empty state can't flash in before load.
  const grandTotal = summary ? BLOCKS.reduce((sum, b) => sum + total(summary[b.key]), 0) : 0;

  return (
    <div>
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Your progress</h1>
      <p className="mb-7.5 text-base leading-[1.6] text-text-muted">
        How your cards are distributed across each exercise type.
      </p>

      {summary && grandTotal === 0 ? (
        <div className="relative rounded-2xl border border-border-soft bg-bg-cards px-5 py-15 text-center text-text-muted backdrop-blur-[10px]">
          <h3 className="mb-2.5 text-[1.3rem] text-white">No progress yet</h3>
          <p>Once you start studying, your progress will show up here, broken down by status.</p>
          <StartStudyingLink />
        </div>
      ) : (
        BLOCKS.map((block, idx) => {
          const counts = summary ? summary[block.key] : EMPTY_COUNTS;
          const blockTotal = total(counts);
          return (
            <div className="relative mb-[22px] pl-14" key={block.key}>
              {idx < BLOCKS.length - 1 && (
                <div
                  className="absolute bottom-[-22px] left-[19px] top-[66px] w-0.5 bg-[linear-gradient(to_bottom,var(--pb-accent),transparent)]"
                  style={{ "--pb-accent": block.accent } as CSSProperties}
                />
              )}
              <div
                className="absolute left-0 top-[26px] flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--pb-accent)] bg-bg-main shadow-[0_0_10px_var(--pb-accent)] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:text-[var(--pb-accent)]"
                style={{ "--pb-accent": block.accent } as CSSProperties}
              >
                {block.icon}
              </div>
              <GlassCard className="ml-4">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  <h3 className="m-0 text-[1.15rem] font-extrabold">{block.title}</h3>
                  <span className="text-sm font-semibold text-text-muted">{blockTotal} total</span>
                </div>
                <div className="mt-3.5 mb-2.5 flex h-3.5 overflow-hidden rounded-lg bg-white/[0.04]">
                  {PROGRESS_STATUSES.map((status, i) => {
                    const count = counts[status];
                    const pct = blockTotal > 0 ? (count / blockTotal) * 100 : 0;
                    // Segments always render, even at 0% -- that keeps them mounted across the
                    // fallback-to-real-data swap so the width change (0% -> real) is a transition,
                    // not a pop-in. Staggered per segment so the bar reads as filling left to right.
                    return (
                      <div
                        className="h-full transition-[width] duration-[1400ms] ease-out motion-reduce:duration-0"
                        key={status}
                        style={{ width: `${pct}%`, background: STATUS_COLORS[status], transitionDelay: `${i * 90}ms` }}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-4">
                  {PROGRESS_STATUSES.map((status) => (
                    <div className="flex items-center gap-2 text-sm font-semibold text-text-muted" key={status}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                      {STATUS_LABELS[status]} <b className="tabular-nums text-white">{counts[status]}</b>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          );
        })
      )}
    </div>
  );
}
