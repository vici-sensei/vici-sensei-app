import type { ProgressStatus } from "@/lib/srs/constants";

const LABELS: Record<ProgressStatus, string> = {
  new: "New",
  learning: "Learning",
  review: "Review",
  relearning: "Relearning",
  suspended: "Suspended",
};

const STYLES: Record<ProgressStatus, { pill: string; dot: string }> = {
  new: { pill: "text-text-muted bg-white/5", dot: "bg-text-muted" },
  learning: { pill: "text-accent-blue bg-accent-blue/10", dot: "bg-accent-blue" },
  review: { pill: "text-accent-gold bg-accent-gold/10", dot: "bg-accent-gold" },
  relearning: { pill: "text-[#ff8a93] bg-accent-red/10", dot: "bg-accent-red" },
  suspended: { pill: "text-gray-500 bg-white/[0.03] border border-dashed border-border-soft", dot: "bg-gray-500" },
};

export function StatusPill({ status }: { status: ProgressStatus }) {
  const { pill, dot } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-[5px] text-xs font-extrabold capitalize ${pill}`}>
      <span className={`h-1.75 w-1.75 rounded-full ${dot}`} />
      {LABELS[status]}
    </span>
  );
}
