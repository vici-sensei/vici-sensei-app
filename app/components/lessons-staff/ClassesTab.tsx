"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { personName, type StaffClass, type StaffOverview } from "@/lib/client-data/lessonsStaff";
import { formatKey } from "@/lib/lessons/time";
import { ClassDialog, OneOffDialog, currentVersion } from "./ClassDialogs";
import type { Act } from "./OccurrenceDialog";
import { Pill, WEEKDAYS, hhmm } from "./staffUi";

/** The admin's list of classes, with the forms to create, edit and end them. */
export function ClassesTab({ overview, todayNy, busy, act }: { overview: StaffOverview; todayNy: string; busy: boolean; act: Act }) {
  const [editing, setEditing] = useState<StaffClass | "new" | null>(null);
  const [oneOff, setOneOff] = useState(false);
  const people = overview.people;

  const weekly = overview.classes.filter((c) => c.kind === "weekly");
  const oneOffs = overview.classes.filter((c) => c.kind === "one_off");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing("new")}>New weekly class</Button>
        <Button size="sm" variant="secondary" onClick={() => setOneOff(true)}>New one-off lesson</Button>
      </div>

      {overview.teachers.length === 0 ? (
        <p className="mb-4 rounded-xl border border-accent-gold/30 bg-accent-gold/[0.06] p-3 text-[0.86rem]">
          No teacher accounts yet. Make someone a teacher in the Students tab first: every class needs one.
        </p>
      ) : null}

      <h3 className="mb-2 text-base font-extrabold">Weekly classes</h3>
      {weekly.length === 0 ? <p className="mb-6 text-[0.88rem] text-text-muted">No classes yet.</p> : null}
      <div className="mb-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {weekly.map((c) => {
          const v = currentVersion(c, todayNy);
          const upcoming = c.versions.filter((x) => x.valid_from > todayNy);
          return (
            <GlassCard key={c.class_id} padding="sm" className="!h-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-[1rem] font-extrabold">
                    {v.title}
                    {v.level_label ? <span className="ml-2 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.7rem] font-extrabold text-text-muted">{v.level_label}</span> : null}
                  </h4>
                  <p className="mt-1 text-[0.84rem] text-text-muted">
                    {WEEKDAYS[v.weekday - 1]} {hhmm(v.start_time)} New York · {v.duration_min} min · {v.capacity} seats
                  </p>
                  <p className="mt-0.5 text-[0.84rem] text-text-muted">Teacher: {personName(people, v.teacher)}</p>
                </div>
                <Pill tone="muted">{c.fixed.length} {c.fixed.length === 1 ? "student" : "students"}</Pill>
              </div>
              {upcoming.map((x) => (
                <p key={x.id} className="mt-2 text-[0.78rem] text-accent-orange">
                  From {formatKey(x.valid_from, { day: "numeric", month: "short", year: "numeric" })}: {WEEKDAYS[x.weekday - 1]} {hhmm(x.start_time)}, {x.capacity} seats
                </p>
              ))}
              {v.valid_until ? (
                <p className="mt-2 text-[0.78rem] text-accent-red">Ends {formatKey(v.valid_until, { day: "numeric", month: "short", year: "numeric" })}</p>
              ) : null}
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>Edit or end</Button>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {oneOffs.length > 0 ? (
        <>
          <h3 className="mb-2 text-base font-extrabold">One-off lessons</h3>
          <ul className="space-y-2">
            {oneOffs.map((c) => {
              const v = c.versions[0];
              return (
                <li key={c.class_id} className="rounded-xl border border-border-soft bg-white/[0.03] p-3 text-[0.88rem]">
                  <strong>{v.title}</strong> · {formatKey(v.valid_from, { weekday: "short", day: "numeric", month: "short" })} {hhmm(v.start_time)} New York · {v.capacity} seats ·{" "}
                  {personName(people, v.teacher)}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {editing ? (
        <ClassDialog overview={overview} todayNy={todayNy} busy={busy} act={act} onClose={() => setEditing(null)} editing={editing === "new" ? null : editing} />
      ) : null}
      {oneOff ? <OneOffDialog overview={overview} todayNy={todayNy} busy={busy} act={act} onClose={() => setOneOff(false)} /> : null}
    </div>
  );
}
