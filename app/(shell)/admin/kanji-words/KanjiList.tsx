"use client";

import { useMemo, useState } from "react";
import { FaPenToSquare, FaRotate } from "react-icons/fa6";
import { applyKanjiReviewed, reloadKanjiWords } from "@/lib/client-data/adminKanjiWords";
import { describeKanjiWordsError, isKanjiWordsConflict, setKanjiReviewed } from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { useToast } from "@/app/components/ui/Toast";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import type { KanjiWordsMeaningsMap, KanjiWordsRow, KanjiWordTuple } from "@/lib/types";
import { maxGap } from "./kanjiWordsView";
import { ReviewedToggle } from "./ReviewedToggle";
import { gapText, gapToneClasses } from "./wordLabels";
import { useWordPopover, WORD_CHIP_CLASSES } from "./WordPopover";

interface KanjiListProps {
  rows: KanjiWordsRow[];
  selectedId: number | null;
  checked: Set<number>;
  /** How many rows to draw; the rest wait behind "Show more" so 2229 kanji don't all hit the DOM at once. */
  limit: number;
  onShowMore: () => void;
  onSelect: (id: number) => void;
  onToggleChecked: (id: number) => void;
  /** The words' meanings for the chips' popover, loaded after the list (null = not yet). */
  meanings: KanjiWordsMeaningsMap | null;
  meaningsFailed: boolean;
}

function Flag({ className, children, title }: { className: string; children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.65rem] font-extrabold ${className}`}
    >
      {children}
    </span>
  );
}

function KanjiListRow({
  row,
  selected,
  checked,
  onSelect,
  onToggleChecked,
  reviewBusy,
  onToggleReviewed,
}: {
  row: KanjiWordsRow;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleChecked: () => void;
  reviewBusy: boolean;
  onToggleReviewed: () => void;
}) {
  const worst = maxGap(row.f);
  // Reviewed rows get a faint green wash so they stand out while scrolling; the selection's blue wins the
  // background, and the green bar on the left (alone, the two washes look alike) keeps them apart.
  const background = selected
    ? "bg-accent-blue/[0.08]"
    : row.r
      ? "bg-accent-green/[0.07] hover:bg-accent-green/[0.1]"
      : "hover:bg-white/[0.03]";
  const reviewedBar = row.r ? "shadow-[inset_3px_0_0_rgba(52,211,153,0.7)]" : "";
  return (
    <li
      className={`flex items-start gap-2.5 border-b border-border-soft/50 px-3 py-2.5 last:border-0 ${background} ${reviewedBar}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleChecked}
        aria-label={`Select ${row.k} for a bulk action`}
        className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-accent-blue"
      />
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 cursor-pointer text-left" aria-current={selected}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[1.7rem] font-bold leading-none">{row.k}</span>
          <LevelBadge level={row.lv} size="sm" />
          {row.ac ? (
            <Flag
              title="The algorithm's result changed since this kanji was reviewed"
              className="border-accent-orange/30 bg-accent-orange/10 text-accent-orange"
            >
              <FaRotate className="h-2.5 w-2.5" /> Re-check
            </Flag>
          ) : null}
          {row.a !== null ? (
            <Flag title="Different from what the algorithm picked" className="border-accent-blue/30 bg-accent-blue/10 text-accent-blue">
              <FaPenToSquare className="h-2.5 w-2.5" /> Edited
            </Flag>
          ) : null}
          {worst >= 2 ? (
            <Flag title="Highest word level above the kanji's own" className={gapToneClasses(worst)}>
              {gapText(worst)}
            </Flag>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-xs text-text-muted">{row.m.join(", ") || "—"}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {row.f.length === 0 ? (
            <span className="text-xs italic text-text-muted">No words</span>
          ) : (
            row.f.map((w) => (
              <span
                key={w[0]}
                data-word-id={w[0]}
                className={`rounded-md border px-1.5 pb-1 pt-[1em] text-[0.82rem] leading-none ${gapToneClasses(w[3])} ${WORD_CHIP_CLASSES}`}
              >
                {renderWordWithFurigana(w[1], w[5], "text-[0.6rem] font-normal opacity-80", "bg-white/5")}
              </span>
            ))
          )}
        </span>
      </button>
      <ReviewedToggle name={row.k} reviewed={row.r} busy={reviewBusy} onToggle={onToggleReviewed} />
    </li>
  );
}

export function KanjiList({
  rows,
  selectedId,
  checked,
  limit,
  onShowMore,
  onSelect,
  onToggleChecked,
  meanings,
  meaningsFailed,
}: KanjiListProps) {
  const { showToast } = useToast();
  const tuples = useMemo(() => new Map<number, KanjiWordTuple>(rows.flatMap((row) => row.f.map((w) => [w[0], w]))), [rows]);
  // The chip's level and "not common" used to be its title; they head the popover now.
  const { handlers, popover } = useWordPopover((id) => {
    const w = tuples.get(id);
    if (!w) return null;
    const m = meanings?.[String(id)];
    return {
      word: w[1],
      jlpt: w[2],
      common: w[4],
      meanings: m ? { short: m[0], primary: m[1], other: m[2] } : meaningsFailed ? "error" : "loading",
    };
  });

  // The check at the right of a row: marks the kanji as reviewed, or takes the mark away, right away, like the green
  // circle of its panel (its words stay as saved; a draft in the panel isn't touched). Quotes the row's version, so a
  // kanji changed since the list was read is refused, and the list is read again.
  const [reviewBusy, setReviewBusy] = useState<ReadonlySet<number>>(() => new Set());
  async function toggleReviewed(row: KanjiWordsRow) {
    const next = !row.r;
    setReviewBusy((prev) => new Set(prev).add(row.id));
    try {
      const result = await setKanjiReviewed(createClient(), { kanjiId: row.id, reviewed: next, expectedVersion: row.v });
      applyKanjiReviewed({ kanjiId: row.id, from: row.v, version: result.version, reviewed: next });
      showToast(next ? `${row.k} marked as reviewed.` : `${row.k} marked as not reviewed.`);
    } catch (err) {
      if (isKanjiWordsConflict(err)) {
        showToast(`${row.k} changed since the list was loaded. It's being read again, try once more.`, "error");
        reloadKanjiWords();
      } else {
        showToast(describeKanjiWordsError(err, "Failed to change the reviewed mark."), "error");
      }
    } finally {
      setReviewBusy((prev) => {
        const rest = new Set(prev);
        rest.delete(row.id);
        return rest;
      });
    }
  }

  return (
    <>
      <ul {...handlers}>
        {rows.slice(0, limit).map((row) => (
          <KanjiListRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            checked={checked.has(row.id)}
            onSelect={() => onSelect(row.id)}
            onToggleChecked={() => onToggleChecked(row.id)}
            reviewBusy={reviewBusy.has(row.id)}
            onToggleReviewed={() => void toggleReviewed(row)}
          />
        ))}
      </ul>
      {popover}
      {rows.length > limit ? (
        <div className="p-3 text-center">
          <button
            type="button"
            onClick={onShowMore}
            className="cursor-pointer rounded-lg border border-border-soft bg-white/[0.03] px-4 py-2 text-[0.85rem] font-bold text-text-muted hover:border-white/20 hover:text-white"
          >
            Show more ({rows.length - limit} left)
          </button>
        </div>
      ) : null}
    </>
  );
}
