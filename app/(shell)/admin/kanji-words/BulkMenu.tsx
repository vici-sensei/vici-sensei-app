"use client";

import { useEffect, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import type { KanjiWordsBulkOp } from "@/lib/types";

export interface BulkChoice {
  op: KanjiWordsBulkOp;
  params: Record<string, unknown>;
}

interface BulkMenuProps {
  /** How many kanji the action would touch, and in what words ("the 519 kanji shown", "your 12 selected kanji"). */
  scopeCount: number;
  scopeLabel: string;
  onPick: (choice: BulkChoice) => void;
}

const ITEM_CLASSES =
  "block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-[0.85rem] font-semibold transition-colors hover:bg-white/[0.06]";

/** "Bulk actions" dropdown. It only picks the action; the page runs it through OperationModal, which previews first. */
export function BulkMenu({ scopeCount, scopeLabel, onPick }: BulkMenuProps) {
  const [open, setOpen] = useState(false);
  const [minGap, setMinGap] = useState(2);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(choice: BulkChoice) {
    setOpen(false);
    onPick(choice);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={scopeCount === 0}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-soft bg-white/[0.03] px-4 py-2.5 text-[0.85rem] font-extrabold text-text-muted transition-all hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-45"
      >
        Bulk actions
        <FaChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] rounded-xl border border-border-soft bg-gray-900 p-2 shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
        >
          <p className="px-3 pt-1 pb-2 text-xs text-text-muted">
            Applies to {scopeLabel} ({scopeCount}). You see a preview before anything changes.
          </p>
          <div className="px-3 pb-1">
            <label className="flex items-center gap-2 text-[0.85rem] font-semibold">
              Remove words
              <select
                value={minGap}
                onChange={(e) => setMinGap(Number(e.target.value))}
                className="rounded-lg border border-border-soft bg-bg-main px-2 py-1 text-[0.85rem]"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
              levels above the kanji
            </label>
            <button
              type="button"
              role="menuitem"
              onClick={() => pick({ op: "remove_gap", params: { min_gap: minGap } })}
              className="mt-2 cursor-pointer rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-1.5 text-[0.82rem] font-bold text-accent-red hover:bg-accent-red/15"
            >
              Preview removal…
            </button>
          </div>
          <div className="my-2 border-t border-border-soft" />
          <button type="button" role="menuitem" className={ITEM_CLASSES} onClick={() => pick({ op: "reset", params: {} })}>
            Reset to what the algorithm picks
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM_CLASSES}
            onClick={() => pick({ op: "review", params: { reviewed: true } })}
          >
            Mark as reviewed
          </button>
          <button
            type="button"
            role="menuitem"
            className={ITEM_CLASSES}
            onClick={() => pick({ op: "review", params: { reviewed: false } })}
          >
            Mark as not reviewed
          </button>
        </div>
      ) : null}
    </div>
  );
}
