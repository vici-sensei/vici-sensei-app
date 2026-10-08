"use client";

import { FaArrowRightArrowLeft, FaClock, FaUserCheck } from "react-icons/fa6";
import { formatTimeRange, weeklyShiftMinutes } from "@/lib/lessons/time";
import type { LessonView } from "@/lib/lessons/types";

/** "1 hour earlier", "30 minutes later" -- how this lesson's time on the student's clock differs from
 * the same class last week. null when it does not. */
export function shiftText(shiftMinutes: number): string | null {
  if (shiftMinutes === 0) return null;
  const abs = Math.abs(shiftMinutes);
  const amount = abs % 60 === 0 ? `${abs / 60} ${abs === 60 ? "hour" : "hours"}` : `${abs} minutes`;
  return `${amount} ${shiftMinutes < 0 ? "earlier" : "later"} than last week`;
}

export function SeatDots({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: Math.max(capacity, taken) }, (_, i) => (
        <span key={i} className={`h-2 w-2 rounded-full ${i < taken ? "bg-accent-gold" : "bg-white/15"}`} />
      ))}
    </span>
  );
}

interface LessonCardProps {
  lesson: LessonView;
  tz: string;
  nowMs: number;
  onOpen: (lesson: LessonView) => void;
  /** Roomier layout for the single-day view. */
  large?: boolean;
}

export function LessonCard({ lesson, tz, nowMs, onOpen, large = false }: LessonCardProps) {
  const past = lesson.endMs <= nowMs;
  const started = lesson.startMs <= nowMs;
  const full = lesson.taken >= lesson.capacity;
  const vacated = lesson.moved_to !== null;
  const shift = shiftText(weeklyShiftMinutes(lesson.startMs, tz));

  let tone = "border-border-soft bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]";
  if (lesson.mine === "standing") tone = "border-accent-green/40 bg-accent-green/10 hover:border-accent-green/70";
  else if (lesson.mine === "move") tone = "border-accent-blue/40 bg-accent-blue/10 hover:border-accent-blue/70";
  else if (vacated) tone = "border-dashed border-white/20 bg-transparent opacity-70 hover:opacity-100";

  const teacher = lesson.teacher.display_name?.trim() || "Teacher";
  const range = formatTimeRange(lesson.startMs, lesson.endMs, tz);
  const label = [
    range,
    lesson.title,
    `with ${teacher}`,
    lesson.mine === "standing" ? "your weekly class" : lesson.mine === "move" ? "your lesson this week" : vacated ? "you moved away from this lesson" : null,
    full && !lesson.mine ? "full" : `${lesson.taken} of ${lesson.capacity} seats taken`,
    shift,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={() => onOpen(lesson)}
      aria-label={label}
      className={`block w-full cursor-pointer rounded-xl border text-left transition-colors ${large ? "p-4" : "p-3"} ${tone} ${
        past ? "opacity-50" : ""
      }`}
    >
      <div className={`flex items-center justify-between gap-2 font-extrabold ${large ? "text-base" : "text-[0.82rem]"}`}>
        <span>{range}</span>
        {lesson.mine === "standing" ? <FaUserCheck className="shrink-0 text-accent-green" aria-hidden="true" /> : null}
        {lesson.mine === "move" ? <FaArrowRightArrowLeft className="shrink-0 text-accent-blue" aria-hidden="true" /> : null}
      </div>

      <div className={`mt-1 font-bold ${large ? "text-[0.95rem]" : "text-[0.85rem]"} ${vacated ? "line-through decoration-white/30" : ""}`}>
        {lesson.title}
        {lesson.level_label ? <span className="ml-1.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.68rem] font-extrabold text-text-muted">{lesson.level_label}</span> : null}
      </div>
      <div className="mt-0.5 truncate text-[0.78rem] text-text-muted">{teacher}</div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[0.74rem] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <SeatDots taken={lesson.taken} capacity={lesson.capacity} />
          {full && !lesson.mine ? <span className="font-bold text-[#ff8a93]">Full</span> : <span>{lesson.taken}/{lesson.capacity}</span>}
        </span>
        {lesson.mine === "move" ? <span className="font-bold text-accent-blue">This week only</span> : null}
        {vacated ? <span className="font-bold">You moved away</span> : null}
        {started && !past ? <span className="font-bold text-accent-green">In progress</span> : null}
      </div>

      {shift ? (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-orange/10 px-2 py-1 text-[0.72rem] font-bold text-accent-orange">
          <FaClock aria-hidden="true" />
          {shift}
        </div>
      ) : null}
    </button>
  );
}
