"use client";

import { useState } from "react";
import { FaCheck, FaXmark } from "react-icons/fa6";
import {
  PRACTICE_CATEGORY_LABEL,
  type PracticeCategory,
} from "@/lib/study/practiceCategories";
import { Button } from "@/app/components/ui/Button";

const ACCENT: Record<PracticeCategory, { selected: string; badge: string }> = {
  hiragana: {
    selected:
      "border-accent-violet bg-accent-violet/[0.08] shadow-[0_0_20px_rgba(167,139,250,0.25)]",
    badge: "bg-accent-violet text-black",
  },
  katakana: {
    selected:
      "border-accent-orange bg-accent-orange/[0.08] shadow-[0_0_20px_rgba(251,146,60,0.25)]",
    badge: "bg-accent-orange text-black",
  },
  kanji: {
    selected:
      "border-accent-blue bg-accent-blue/[0.08] shadow-[0_0_20px_rgba(0,210,255,0.25)]",
    badge: "bg-accent-blue text-black",
  },
  vocabulary: {
    selected:
      "border-accent-gold bg-accent-gold/[0.08] shadow-[0_0_20px_rgba(255,210,0,0.25)]",
    badge: "bg-accent-gold text-black",
  },
};

interface PracticeCategoryPickerProps {
  availableCategories: readonly PracticeCategory[];
  initialCategories: readonly PracticeCategory[];
  onStart: (categories: PracticeCategory[]) => void;
  onClose: () => void;
}

/** /study/practice's setup screen -- lets the user toggle any combination of the categories
 * their study_track has content for on, then hands the final selection to Start. Each category
 * toggles independently (unlike LevelGrid's single-cascading-value JLPT picker), so `selected` is
 * a plain Set rather than a single "furthest" value. */
export function PracticeCategoryPicker({
  availableCategories,
  initialCategories,
  onStart,
  onClose,
}: PracticeCategoryPickerProps) {
  const [selected, setSelected] = useState<Set<PracticeCategory>>(
    () => new Set(initialCategories),
  );

  function toggle(category: PracticeCategory) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close practice setup"
        className="flex h-9 w-9 min-h-9 min-w-9 self-start items-center justify-center rounded-full bg-white/5 text-text-muted [&>svg]:h-4 [&>svg]:w-4"
      >
        <FaXmark />
      </button>
      <div className="flex flex-col h-full w-full max-w-[380px] items-center justify-center gap-8 text-center">
        <div>
          <h1 className="mb-2 text-lg font-bold text-white">
            What do you want to practice?
          </h1>
          <p className="text-[0.9rem] leading-[1.6] text-text-muted">
            Pick one or more categories — you&apos;ll only get cards from those.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3">
          {availableCategories.map((category) => {
            const isSelected = selected.has(category);
            const accent = ACCENT[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggle(category)}
                className={`rounded-full relative flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border font-sans transition-all duration-200 ${
                  isSelected
                    ? accent.selected
                    : "border-border-soft bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <span
                  className={`absolute -right-[0px] -top-[0px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg-main ${
                    isSelected ? accent.badge : "hidden"
                  }`}
                >
                  <FaCheck className="h-[11px] w-[11px]" />
                </span>
                <span className="text-[1.05rem] font-extrabold text-white">
                  {PRACTICE_CATEGORY_LABEL[category]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="w-full flex flex-row justify-center">
        <Button
          disabled={selected.size === 0}
          onClick={() => onStart(Array.from(selected))}
          className="w-fit"
        >
          Start practice
        </Button>
      </div>
    </div>
  );
}
