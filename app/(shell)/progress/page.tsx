import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { ProgressSummaryResponse, ProgressStatusCounts } from "@/lib/types";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/srs/constants";

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
        <div className="method-card empty-progress">
          <h3>No progress yet</h3>
          <p>Once you start studying, your kanji and vocabulary will show up here, broken down by status.</p>
          <Link href="/study" className="btn-primary" style={{ marginTop: 10, display: "inline-flex" }}>
            Start studying
          </Link>
        </div>
      ) : (
        BLOCKS.map((block, idx) => {
          const counts = summary[block.key];
          const blockTotal = total(counts);
          return (
            <div className="progress-block" key={block.key}>
              {idx < BLOCKS.length - 1 && <div className="progress-timeline-line" style={{ "--pb-accent": block.accent } as CSSProperties} />}
              <div className="progress-icon" style={{ "--pb-accent": block.accent } as CSSProperties}>
                {block.icon}
              </div>
              <div className="method-card" style={{ marginLeft: 16 }}>
                <div className="pb-title-row">
                  <h3>{block.title}</h3>
                  <span className="pb-total">{blockTotal} total</span>
                </div>
                <div className="stack-bar">
                  {PROGRESS_STATUSES.map((status) => {
                    const count = counts[status];
                    if (count === 0 || blockTotal === 0) return null;
                    return (
                      <div
                        className="stack-seg"
                        key={status}
                        style={{ width: `${(count / blockTotal) * 100}%`, background: STATUS_COLORS[status] }}
                      />
                    );
                  })}
                </div>
                <div className="status-legend">
                  {PROGRESS_STATUSES.map((status) => (
                    <div className="legend-item" key={status}>
                      <span className="legend-dot" style={{ background: STATUS_COLORS[status] }} />
                      {STATUS_LABELS[status]} <b>{counts[status]}</b>
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
