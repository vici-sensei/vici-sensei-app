"use client";

import { useMemo, useState } from "react";
import { formatKey, localDateKey, weekRange } from "@/lib/lessons/time";
import { lessonKey, type LessonStudent, type LessonView } from "@/lib/lessons/types";
import { LessonCard } from "./LessonCard";
import { LessonDialog, type LessonHandlers } from "./LessonDialog";
import type { LessonsView } from "./LessonsToolbar";

interface LessonsCalendarProps {
  lessons: LessonView[];
  student: LessonStudent;
  tz: string;
  nowMs: number;
  todayKey: string;
  view: LessonsView;
  anchorKey: string;
  weekStart: number;
  busy: boolean;
  handlers: LessonHandlers;
}

function DayColumn({
  dayKey,
  lessons,
  isToday,
  tz,
  nowMs,
  onOpen,
  large = false,
  alwaysShow = false,
}: {
  dayKey: string;
  lessons: LessonView[];
  isToday: boolean;
  tz: string;
  nowMs: number;
  onOpen: (l: LessonView) => void;
  large?: boolean;
  alwaysShow?: boolean;
}) {
  const empty = lessons.length === 0;
  return (
    <section
      aria-label={formatKey(dayKey, { weekday: "long", month: "long", day: "numeric" })}
      // Narrow screens list only the days that have lessons; the 7-column layout keeps every day.
      className={`${empty && !alwaysShow ? "hidden xl:block" : ""} min-w-0 rounded-2xl border p-3 ${
        isToday ? "border-accent-red/40 bg-accent-red/[0.04]" : "border-border-soft bg-bg-cards"
      }`}
    >
      <header className="mb-2.5 flex items-baseline gap-2">
        <span className={`text-[0.78rem] font-extrabold uppercase tracking-wider ${isToday ? "text-accent-red" : "text-text-muted"}`}>
          {formatKey(dayKey, { weekday: "short" })}
        </span>
        <span className="text-lg font-extrabold">{formatKey(dayKey, { day: "numeric" })}</span>
        <span className="text-[0.75rem] text-text-muted">{formatKey(dayKey, { month: "short" })}</span>
        {isToday ? <span className="ml-auto rounded-md bg-accent-red/15 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-accent-red">TODAY</span> : null}
      </header>
      {empty ? (
        <p className="py-2 text-center text-[0.8rem] text-text-muted">{alwaysShow ? "No lessons this day." : "—"}</p>
      ) : (
        <div className="space-y-2">
          {lessons.map((l) => (
            <LessonCard key={lessonKey(l)} lesson={l} tz={tz} nowMs={nowMs} onOpen={onOpen} large={large} />
          ))}
        </div>
      )}
    </section>
  );
}

export function LessonsCalendar({ lessons, student, tz, nowMs, todayKey, view, anchorKey, weekStart, busy, handlers }: LessonsCalendarProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, LessonView[]>();
    for (const l of lessons) {
      const key = localDateKey(l.startMs, tz);
      const list = map.get(key);
      if (list) list.push(l);
      else map.set(key, [l]);
    }
    return map;
  }, [lessons, tz]);

  const week = weekRange(anchorKey, weekStart, tz);
  // Always the freshest copy: after a booking the schedule is reloaded and the open dialog follows it.
  const selected = selectedKey ? (lessons.find((l) => lessonKey(l) === selectedKey) ?? null) : null;

  const closeOnSuccess = useMemo<LessonHandlers>(() => {
    const wrap = <A extends unknown[]>(run: (...args: A) => Promise<boolean>) => async (...args: A) => {
      const ok = await run(...args);
      if (ok) setSelectedKey(null);
      return ok;
    };
    return { enroll: wrap(handlers.enroll), leave: wrap(handlers.leave), moveOnce: wrap(handlers.moveOnce), undoMove: wrap(handlers.undoMove) };
  }, [handlers]);

  return (
    <>
      {view === "week" ? (
        <>
          {lessons.length === 0 ? (
            <p className="mb-3 rounded-xl border border-border-soft bg-white/[0.02] p-4 text-center text-[0.88rem] text-text-muted">
              No lessons are scheduled this week.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
            {week.days.map((key) => (
              <DayColumn key={key} dayKey={key} lessons={byDay.get(key) ?? []} isToday={key === todayKey} tz={tz} nowMs={nowMs} onOpen={(l) => setSelectedKey(lessonKey(l))} />
            ))}
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-xl">
          <DayColumn
            dayKey={anchorKey}
            lessons={byDay.get(anchorKey) ?? []}
            isToday={anchorKey === todayKey}
            tz={tz}
            nowMs={nowMs}
            onOpen={(l) => setSelectedKey(lessonKey(l))}
            large
            alwaysShow
          />
        </div>
      )}

      {selected ? (
        <LessonDialog
          key={lessonKey(selected)}
          lesson={selected}
          all={lessons}
          student={student}
          nowMs={nowMs}
          tz={tz}
          weekStart={weekStart}
          busy={busy}
          onClose={() => setSelectedKey(null)}
          handlers={closeOnSuccess}
        />
      ) : null}
    </>
  );
}
