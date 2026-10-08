"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { personName, profileKey, staffActions, type StaffOverview } from "@/lib/client-data/lessonsStaff";
import { formatKey } from "@/lib/lessons/time";
import type { Act } from "./OccurrenceDialog";
import { Field, Pill, inputClass, selectClass } from "./staffUi";

/** Date ranges with no lessons, for everybody or for one teacher. Lessons inside them are cancelled. */
export function VacationsTab({ overview, todayNy, busy, act }: { overview: StaffOverview; todayNy: string; busy: boolean; act: Act }) {
  const [scope, setScope] = useState<"global" | "teacher">("global");
  const [teacher, setTeacher] = useState("");
  const [from, setFrom] = useState(todayNy);
  const [to, setTo] = useState(todayNy);
  const [reason, setReason] = useState("");

  const people = overview.people;

  async function add() {
    const [region, user_id] = teacher.split(":");
    const ok = await act(
      () =>
        staffActions.addVacation({
          scope,
          teacher: scope === "teacher" ? { region: region as "eu" | "us", user_id } : undefined,
          fromDate: from,
          toDate: to,
          reason: reason.trim() || null,
        }),
      "Vacation added. The students with lessons in it were told."
    );
    if (ok) setReason("");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <GlassCard padding="sm" className="!h-auto">
        <h3 className="mb-3 text-base font-extrabold">Add a vacation</h3>
        <div className="space-y-3.5">
          <Field label="Who is away">
            <select className={selectClass} value={scope} onChange={(e) => setScope(e.target.value as "global" | "teacher")}>
              <option value="global">No lessons for anybody</option>
              <option value="teacher">One teacher only</option>
            </select>
          </Field>
          {scope === "teacher" ? (
            <Field label="Teacher">
              <select className={selectClass} value={teacher} onChange={(e) => setTeacher(e.target.value)}>
                <option value="">Choose a teacher…</option>
                {overview.teachers.map((t) => (
                  <option key={profileKey(t)} value={profileKey(t)}>{t.display_name ?? "Unnamed"}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="From (New York date)">
              <input type="date" className={inputClass} value={from} min={todayNy} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
            </Field>
            <Field label="Through">
              <input type="date" className={inputClass} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason (optional, shown to the students)">
            <input className={inputClass} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Winter break" />
          </Field>
          <Button size="sm" loading={busy} disabled={scope === "teacher" && !teacher} onClick={() => void add()}>Add vacation</Button>
        </div>
      </GlassCard>

      <div>
        <h3 className="mb-3 text-base font-extrabold">Vacations</h3>
        {overview.vacations.length === 0 ? <p className="text-[0.88rem] text-text-muted">None.</p> : null}
        <ul className="space-y-2">
          {overview.vacations.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-white/[0.03] p-3 text-[0.88rem]">
              <span>
                <strong>
                  {formatKey(v.from_date, { day: "numeric", month: "short", year: "numeric" })}
                  {v.to_date !== v.from_date ? ` – ${formatKey(v.to_date, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                </strong>
                <span className="mt-0.5 block text-[0.78rem] text-text-muted">
                  {v.scope === "global" ? "Everybody" : v.teacher ? personName(people, v.teacher) : "A teacher"}
                  {v.reason ? ` · ${v.reason}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Pill tone={v.scope === "global" ? "orange" : "blue"}>{v.scope === "global" ? "All" : "Teacher"}</Pill>
                <button type="button" disabled={busy} className="cursor-pointer text-[0.78rem] font-bold text-[#ff8a93] hover:underline disabled:opacity-50" onClick={() => void act(() => staffActions.deleteVacation(v.id), "Vacation deleted. Its lessons are back.")}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
