import type { ProgressStatus } from "@/lib/srs/constants";

const LABELS: Record<ProgressStatus, string> = {
  new: "New",
  learning: "Learning",
  review: "Review",
  relearning: "Relearning",
  suspended: "Suspended",
};

export function StatusPill({ status }: { status: ProgressStatus }) {
  return <span className={`status-pill status-${status}`}>{LABELS[status]}</span>;
}
