"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FaChevronLeft, FaChevronRight, FaGlobe } from "react-icons/fa6";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { timeZoneCity } from "@/lib/timezone";
import { zoneAbbreviation } from "@/lib/lessons/time";

export type LessonsView = "week" | "day";

interface LessonsToolbarProps {
  view: LessonsView;
  onViewChange: (view: LessonsView) => void;
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  isCurrent: boolean;
  tz: string;
  nowMs: number;
  /** The week/day switch; the teachers' schedule only has weeks. */
  showViewSwitch?: boolean;
  /** Extra controls at the end of the first row (the student's notifications bell). */
  actions?: ReactNode;
}

export function LessonsToolbar({ view, onViewChange, label, onPrev, onNext, onToday, isCurrent, tz, nowMs, showViewSwitch = true, actions }: LessonsToolbarProps) {
  const navButton =
    "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-white/[0.03] text-text-muted transition-colors hover:border-white/20 hover:text-white";

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPrev} className={navButton} aria-label={view === "week" ? "Previous week" : "Previous day"}>
          <FaChevronLeft aria-hidden="true" />
        </button>
        <button type="button" onClick={onNext} className={navButton} aria-label={view === "week" ? "Next week" : "Next day"}>
          <FaChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToday}
          disabled={isCurrent}
          className="h-9 cursor-pointer rounded-lg border border-border-soft bg-white/[0.03] px-3.5 text-[0.82rem] font-bold text-text-muted transition-colors enabled:hover:border-white/20 enabled:hover:text-white disabled:cursor-default disabled:opacity-50"
        >
          Today
        </button>
        <h2 className="ml-1 text-lg font-extrabold" aria-live="polite">
          {label}
        </h2>
      </div>

      {showViewSwitch ? (
        <PillSelector
          variant="tabs"
          active={view}
          onChange={onViewChange}
          options={[
            { value: "week", label: "Week" },
            { value: "day", label: "Day" },
          ]}
        />
      ) : null}
      {actions}

      <p className="flex basis-full items-center gap-2 text-[0.8rem] text-text-muted">
        <FaGlobe className="shrink-0" aria-hidden="true" />
        <span>
          Times are shown in <strong className="text-white">{timeZoneCity(tz)}</strong> time ({zoneAbbreviation(nowMs, tz)}).{" "}
          <Link href="/settings/study" className="font-bold text-accent-blue hover:underline">
            Change
          </Link>
        </span>
      </p>
    </div>
  );
}
