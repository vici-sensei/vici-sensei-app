"use client";

import type { CSSProperties, ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useProgressSummary } from "@/lib/client-data/progress";
import type { ProgressSummaryResponse, ProgressStatusCounts } from "@/lib/types";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/srs/constants";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FaBook, FaFont, FaPenToSquare } from "react-icons/fa6";
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

const BLOCKS: Block[] = [
  {
    key: "kanji_meaning",
    title: "Kanji meaning",
    accent: "var(--color-accent-blue)",
    icon: <FaBook />,
  },
  {
    key: "kanji_reading",
    title: "Kanji reading",
    accent: "var(--color-accent-gold)",
    icon: <FaFont />,
  },
  {
    key: "vocab_meaning",
    title: "Vocabulary meaning",
    accent: "var(--color-accent-red)",
    icon: <FaPenToSquare />,
  },
];

function total(counts: ProgressStatusCounts): number {
  return PROGRESS_STATUSES.reduce((sum, s) => sum + counts[s], 0);
}

export default function ProgressPage() {
  const { user } = useAuth();
  const { data: summary, status } = useProgressSummary(user);

  if (status === "loading" || !summary) {
    return (
      <div>
        <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Your progress</h1>
        <p className="mb-7.5 text-base leading-[1.6] text-text-muted">
          How your cards are distributed across the three exercise types.
        </p>
        <div className="space-y-[22px]">
          {BLOCKS.map((b) => (
            <Skeleton key={b.key} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const grandTotal = BLOCKS.reduce((sum, b) => sum + total(summary[b.key]), 0);

  return (
    <div>
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Your progress</h1>
      <p className="mb-7.5 text-base leading-[1.6] text-text-muted">
        How your cards are distributed across the three exercise types.
      </p>

      {grandTotal === 0 ? (
        <div className="relative rounded-2xl border border-border-soft bg-bg-cards px-5 py-15 text-center text-text-muted backdrop-blur-[10px]">
          <h3 className="mb-2.5 text-[1.3rem] text-white">No progress yet</h3>
          <p>Once you start studying, your kanji and vocabulary will show up here, broken down by status.</p>
          <StartStudyingLink />
        </div>
      ) : (
        BLOCKS.map((block, idx) => {
          const counts = summary[block.key];
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
              <div className="relative ml-4 rounded-2xl border border-border-soft bg-bg-cards p-7 backdrop-blur-[10px]">
                <div className="mb-1 flex flex-wrap items-center gap-3">
                  <h3 className="m-0 text-[1.15rem] font-extrabold">{block.title}</h3>
                  <span className="text-sm font-semibold text-text-muted">{blockTotal} total</span>
                </div>
                <div className="mt-3.5 mb-2.5 flex h-3.5 overflow-hidden rounded-lg bg-white/[0.04]">
                  {PROGRESS_STATUSES.map((status) => {
                    const count = counts[status];
                    if (count === 0 || blockTotal === 0) return null;
                    return (
                      <div
                        className="h-full"
                        key={status}
                        style={{ width: `${(count / blockTotal) * 100}%`, background: STATUS_COLORS[status] }}
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
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
