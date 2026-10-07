"use client";

import { FaCircleCheck, FaPenToSquare, FaRotate } from "react-icons/fa6";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import type { KanjiWordsRow } from "@/lib/types";
import { maxGap } from "./kanjiWordsView";
import { gapText, gapToneClasses } from "./wordLabels";

interface KanjiListProps {
  rows: KanjiWordsRow[];
  selectedId: number | null;
  checked: Set<number>;
  /** How many rows to draw; the rest wait behind "Show more" so 2229 kanji don't all hit the DOM at once. */
  limit: number;
  onShowMore: () => void;
  onSelect: (id: number) => void;
  onToggleChecked: (id: number) => void;
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
}: {
  row: KanjiWordsRow;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleChecked: () => void;
}) {
  const worst = maxGap(row.f);
  return (
    <li
      className={`flex items-start gap-2.5 border-b border-border-soft/50 px-3 py-2.5 last:border-0 ${
        selected ? "bg-accent-blue/[0.08]" : "hover:bg-white/[0.03]"
      }`}
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
          {row.r ? (
            <Flag title="Reviewed" className="border-accent-green/30 bg-accent-green/10 text-accent-green">
              <FaCircleCheck className="h-2.5 w-2.5" />
            </Flag>
          ) : null}
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
                title={`${w[2] ?? "No JLPT level"}${w[4] ? "" : " · not common"}`}
                className={`rounded-md border px-1.5 py-0.5 text-[0.82rem] ${gapToneClasses(w[3])}`}
              >
                {w[1]}
              </span>
            ))
          )}
        </span>
      </button>
    </li>
  );
}

export function KanjiList({ rows, selectedId, checked, limit, onShowMore, onSelect, onToggleChecked }: KanjiListProps) {
  return (
    <>
      <ul>
        {rows.slice(0, limit).map((row) => (
          <KanjiListRow
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            checked={checked.has(row.id)}
            onSelect={() => onSelect(row.id)}
            onToggleChecked={() => onToggleChecked(row.id)}
          />
        ))}
      </ul>
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
