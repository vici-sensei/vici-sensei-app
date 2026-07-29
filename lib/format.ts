/** Short, human-friendly relative time for an SRS due_at timestamp (e.g. "in 10 min", "tomorrow"). */
export function formatDueAt(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "now";

  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return `in ${diffMin} min`;

  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `in ${diffHours}h`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}
