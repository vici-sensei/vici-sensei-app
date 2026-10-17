"use client";

import { FaCircleCheck, FaRegCircleCheck } from "react-icons/fa6";

/**
 * The reviewed mark of one row of a list (/admin/words, the kanji list here), as a button that sets it or takes it
 * away right away: a green check when reviewed, a faint outline when not. `title` overrides the hover text of a
 * reviewed row (who marked it, and when).
 */
export function ReviewedToggle({
  name,
  reviewed,
  busy,
  onToggle,
  title,
}: {
  /** What the row is (the word, the kanji), for screen readers. */
  name: string;
  reviewed: boolean;
  busy: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-pressed={reviewed}
      aria-busy={busy}
      aria-label={`${name} reviewed`}
      title={reviewed ? `${title ?? "Reviewed"}. Press to mark it as not reviewed` : "Mark as reviewed"}
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:cursor-wait ${
        reviewed
          ? "text-accent-green hover:bg-accent-green/10"
          : "text-text-muted/60 hover:bg-accent-green/10 hover:text-accent-green"
      }`}
    >
      {busy ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : reviewed ? (
        <FaCircleCheck className="h-4 w-4" />
      ) : (
        <FaRegCircleCheck className="h-4 w-4" />
      )}
    </button>
  );
}
