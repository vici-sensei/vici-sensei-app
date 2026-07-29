import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { ProgressSummaryResponse, ProgressStatusCounts } from "@/lib/types";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/srs/constants";
import { buttonClasses } from "@/app/components/ui/Button";

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
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    key: "kanji_reading",
    title: "Kanji reading",
    accent: "var(--color-accent-gold)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7V4h16v3M9 20h6M12 4v16" />
      </svg>
    ),
  },
  {
    key: "vocab_meaning",
    title: "Vocabulary meaning",
    accent: "var(--color-accent-red)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
];

function total(counts: ProgressStatusCounts): number {
  return PROGRESS_STATUSES.reduce((sum, s) => sum + counts[s], 0);
}

export default async function ProgressPage() {
  const summary = await fetchServer<ProgressSummaryResponse>("/api/progress/summary");
  const grandTotal = BLOCKS.reduce((sum, b) => sum + total(summary[b.key]), 0);

  return (
    <div>
      <h1 className="main-title">Your progress</h1>
      <p className="subtitle" style={{ marginBottom: 30 }}>
        How your cards are distributed across the three exercise types.
      </p>

      {grandTotal === 0 ? (
        <div className="method-card px-5 py-[60px] text-center text-text-muted">
          <h3 className="mb-2.5 text-[1.3rem] text-white">No progress yet</h3>
          <p>Once you start studying, your kanji and vocabulary will show up here, broken down by status.</p>
          <Link href="/study" className={buttonClasses({ hover: "hover", className: "mt-2.5" })}>
            Start studying
          </Link>
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
              <div className="method-card ml-4">
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
