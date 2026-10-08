"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { formatKey, addDaysKey } from "@/lib/lessons/time";
import type { LessonStudent } from "@/lib/lessons/types";

/** 1 = Monday ... 7 = Sunday. The usual three first; any other value the account already has is kept. */
const COMMON = [1, 7, 6];

// An arbitrary Monday: weekday names come out of Intl in the reader's own language.
const dayName = (isoDay: number) => formatKey(addDaysKey("2024-01-01", isoDay - 1), { weekday: "long" });

export function CalendarSettings({
  student,
  busy,
  onSave,
}: {
  student: LessonStudent;
  busy: boolean;
  onSave: (weekStart: number) => void;
}) {
  const target = student.pending?.week_start ?? student.week_start;
  const [value, setValue] = useState(target);
  const options = COMMON.includes(student.week_start) ? COMMON : [student.week_start, ...COMMON];

  return (
    <section className="mt-8 rounded-2xl border border-border-soft bg-bg-cards p-5">
      <h3 className="text-base font-extrabold">Calendar settings</h3>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-[0.84rem] font-bold text-text-muted">
          Week starts on
          <select
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="mt-1 block cursor-pointer rounded-lg border border-border-soft bg-bg-main px-3 py-2 text-[0.88rem] font-bold text-white"
          >
            {options.map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" variant="secondary" disabled={value === target} loading={busy} onClick={() => onSave(value)}>
          Save
        </Button>
      </div>
      <p className="mt-3 text-[0.78rem] leading-normal text-text-muted">
        Your week decides which lessons count towards your weekly limit. A change starts with next week, so it can&rsquo;t be used to
        squeeze in an extra lesson.
        {student.pending ? ` Your week will start on ${dayName(student.pending.week_start)} from next week.` : ""}
      </p>
    </section>
  );
}
