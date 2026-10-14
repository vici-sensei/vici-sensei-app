"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FaChevronDown, FaFloppyDisk } from "react-icons/fa6";

interface FloatingSaveCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Words ticked or unticked since the last save, counted on the closed circle so they aren't forgotten behind it. */
  pending: number;
  children: ReactNode;
}

/**
 * The editor's save controls folded into a round button that floats at the bottom of the panel (sticky, so it stays
 * in sight while the words scroll). Pressing it grows the card out of the same corner; the chevron in that corner,
 * Escape or a press anywhere else folds it back. What was typed in the card lives in the editor, so folding keeps it.
 */
export function FloatingSaveCard({ open, onOpenChange, pending, children }: FloatingSaveCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLButtonElement>(null);
  // Folded from the keyboard (Escape, the chevron): give focus back to the circle. Not after a press elsewhere,
  // which already put focus where the admin wanted it.
  const refocusCircle = useRef(false);

  useEffect(() => {
    if (!open) {
      if (refocusCircle.current) circleRef.current?.focus();
      refocusCircle.current = false;
      return;
    }
    function onDown(e: PointerEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      refocusCircle.current = true;
      onOpenChange(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex justify-end">
      {open ? (
        <div
          ref={cardRef}
          id="kanji-words-save-card"
          className="pointer-events-auto flex w-full max-w-md origin-bottom-right items-end gap-3 rounded-2xl border border-border-soft bg-gray-900/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-[opacity,scale] duration-200 ease-out starting:scale-[0.15] starting:opacity-0"
        >
          <div className="min-w-0 flex-1 space-y-3">{children}</div>
          <button
            type="button"
            onClick={() => {
              refocusCircle.current = true;
              onOpenChange(false);
            }}
            aria-label="Fold the save card"
            aria-expanded
            aria-controls="kanji-words-save-card"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-soft text-text-muted transition-colors hover:border-white/20 hover:text-white"
          >
            <FaChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          ref={circleRef}
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label={pending > 0 ? `Save (${pending} unsaved change${pending === 1 ? "" : "s"})` : "Save"}
          aria-expanded={false}
          aria-controls="kanji-words-save-card"
          className="pointer-events-auto relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-accent-red text-white shadow-[0_8px_30px_rgba(255,74,90,0.45)] transition-[opacity,scale,translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_40px_rgba(255,74,90,0.65)] starting:scale-50 starting:opacity-0"
        >
          <FaFloppyDisk className="h-5 w-5" />
          {pending > 0 ? (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg-main bg-accent-gold px-1 text-[0.68rem] font-extrabold leading-none text-gray-900">
              {pending}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
