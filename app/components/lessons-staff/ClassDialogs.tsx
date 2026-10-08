"use client";

import { useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { personName, staffActions, type PersonRef, type StaffClass, type StaffOverview, type StaffVersion } from "@/lib/client-data/lessonsStaff";
import { profileKey } from "@/lib/client-data/lessonsStaff";
import { Field, WEEKDAYS, hhmm, inputClass, selectClass } from "./staffUi";
import type { Act } from "./OccurrenceDialog";

/** The version of a class in force today, or the next one (what an edit starts from). */
export function currentVersion(c: StaffClass, todayNy: string): StaffVersion {
  return (
    c.versions.find((v) => v.valid_from <= todayNy && (v.valid_until === null || todayNy < v.valid_until)) ??
    c.versions.find((v) => v.valid_from > todayNy) ??
    c.versions[c.versions.length - 1]
  );
}

function TeacherSelect({ overview, value, onChange }: { overview: StaffOverview; value: string; onChange: (v: string) => void }) {
  return (
    <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Teacher">
      <option value="">Choose a teacher…</option>
      {overview.teachers.map((t) => (
        <option key={profileKey(t)} value={profileKey(t)}>
          {t.display_name ?? "Unnamed"}
        </option>
      ))}
    </select>
  );
}

const asRef = (v: string): PersonRef | null => {
  if (!v) return null;
  const [region, user_id] = v.split(":");
  return { region: region as "eu" | "us", user_id };
};

interface DialogProps {
  overview: StaffOverview;
  todayNy: string;
  busy: boolean;
  act: Act;
  onClose: () => void;
}

/** A new weekly class, or an edit of one. Times are New York wall clock: the class keeps it all year. */
export function ClassDialog({ overview, todayNy, busy, act, onClose, editing }: DialogProps & { editing: StaffClass | null }) {
  const base = editing ? currentVersion(editing, todayNy) : null;
  const [title, setTitle] = useState(base?.title ?? "");
  const [level, setLevel] = useState(base?.level_label ?? "");
  const [weekday, setWeekday] = useState(base?.weekday ?? 1);
  const [time, setTime] = useState(base ? hhmm(base.start_time) : "19:00");
  const [duration, setDuration] = useState(base?.duration_min ?? 60);
  const [capacity, setCapacity] = useState(base?.capacity ?? 3);
  const [teacher, setTeacher] = useState(base ? profileKey(base.teacher) : "");
  const [url, setUrl] = useState(base?.meeting_url ?? "");
  const [from, setFrom] = useState(todayNy);
  const [mode, setMode] = useState<"follow" | "release" | "end">("follow");

  const radio = "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#ff4a5a]";
  const radioRow = "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-soft bg-white/[0.03] p-2.5 text-[0.84rem]";

  async function save() {
    const t = asRef(teacher);
    if (!editing) {
      if (!t) return;
      const ok = await act(
        () => staffActions.createClass({ title, levelLabel: level.trim() || null, weekday, startTime: time, durationMin: duration, capacity, meetingUrl: url.trim() || null, teacher: t, validFrom: from }),
        "Class created."
      );
      if (ok) onClose();
      return;
    }
    if (mode === "end") {
      const ok = await act(() => staffActions.updateClass(editing.class_id, from, "end", {}), "The class ends on that date. Students were told.");
      if (ok) onClose();
      return;
    }
    const changes: Parameters<typeof staffActions.updateClass>[3] = {};
    if (title !== base!.title) changes.title = title;
    if ((level.trim() || null) !== base!.level_label) changes.levelLabel = level.trim() || null;
    if (weekday !== base!.weekday) changes.weekday = weekday;
    if (time !== hhmm(base!.start_time)) changes.startTime = time;
    if (duration !== base!.duration_min) changes.durationMin = duration;
    if (capacity !== base!.capacity) changes.capacity = capacity;
    if ((url.trim() || null) !== base!.meeting_url) changes.meetingUrl = url.trim() || null;
    if (t && profileKey(t) !== profileKey(base!.teacher)) changes.teacher = t;
    const ok = await act(
      () => staffActions.updateClass(editing.class_id, from, mode, changes),
      mode === "follow" ? "Class updated. Students were told." : "New class created. Students were told to pick again."
    );
    if (ok) onClose();
  }

  const ending = mode === "end";

  return (
    <Modal onClose={onClose} labelledBy="class-dialog-title" showCloseButton>
      <div className="max-h-[calc(100dvh-7rem)] w-full overflow-y-auto pr-1 text-left">
        <h3 id="class-dialog-title" className="pr-8 text-xl font-extrabold">{editing ? `Edit “${base!.title}”` : "New weekly class"}</h3>
        <p className="mt-1 text-[0.82rem] text-text-muted">Day and time are New York time; students see them in their own timezone.</p>

        <div className="mt-4 space-y-3.5">
          {!ending ? (
            <>
              <Field label="Name">
                <input className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hiragana & basics" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Level / topic">
                  <input className={inputClass} value={level} maxLength={40} onChange={(e) => setLevel(e.target.value)} placeholder="N5" />
                </Field>
                <Field label="Seats (max 3)">
                  <input type="number" min={1} max={3} className={inputClass} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Day (New York)">
                  <select className={selectClass} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                    {WEEKDAYS.map((d, i) => (
                      <option key={d} value={i + 1}>{d}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Time (New York)" hint={weekday === 7 ? "Not 01:00–02:59 on a Sunday (that hour does not exist or happens twice)." : undefined}>
                  <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Length (minutes)">
                  <input type="number" min={10} max={240} step={5} className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                </Field>
                <Field label="Teacher">
                  <TeacherSelect overview={overview} value={teacher} onChange={setTeacher} />
                </Field>
              </div>
              <Field label="Meeting link" hint="Only the students in a lesson, the teacher and admins see it.">
                <input className={inputClass} value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </Field>
            </>
          ) : null}

          {editing ? (
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-[0.8rem] font-bold text-text-muted">What happens to the students in it?</legend>
              <label className={radioRow}>
                <input type="radio" name="mode" className={radio} checked={mode === "follow"} onChange={() => setMode("follow")} />
                <span>
                  <strong>They follow the change</strong>
                  <span className="block text-[0.76rem] text-text-muted">The class keeps its students. Past lessons stay as they were.</span>
                </span>
              </label>
              <label className={radioRow}>
                <input type="radio" name="mode" className={radio} checked={mode === "release"} onChange={() => setMode("release")} />
                <span>
                  <strong>Release them and start a new class</strong>
                  <span className="block text-[0.76rem] text-text-muted">The old class ends on that date and they pick again.</span>
                </span>
              </label>
              <label className={radioRow}>
                <input type="radio" name="mode" className={radio} checked={mode === "end"} onChange={() => setMode("end")} />
                <span>
                  <strong>End the class</strong>
                  <span className="block text-[0.76rem] text-text-muted">No more lessons from that date; students are released.</span>
                </span>
              </label>
            </fieldset>
          ) : null}

          <Field label={editing ? (ending ? "Last lesson is before" : "Applies from") : "First lesson on or after"} hint="A New York date.">
            <input type="date" className={inputClass} value={from} min={todayNy} onChange={(e) => setFrom(e.target.value)} />
          </Field>

          <div className="flex gap-2 pt-1">
            <Button danger={ending} loading={busy} disabled={!title.trim() && !ending} onClick={() => void save()}>
              {editing ? (ending ? "End the class" : "Save changes") : "Create class"}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** A lesson that happens once (a workshop, a make-up). Students join it with a one-lesson move. */
export function OneOffDialog({ overview, todayNy, busy, act, onClose }: DialogProps) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("");
  const [date, setDate] = useState(todayNy);
  const [time, setTime] = useState("19:00");
  const [duration, setDuration] = useState(60);
  const [capacity, setCapacity] = useState(3);
  const [teacher, setTeacher] = useState("");
  const [url, setUrl] = useState("");

  async function save() {
    const t = asRef(teacher);
    if (!t) return;
    const ok = await act(
      () => staffActions.createOneOff({ title, levelLabel: level.trim() || null, nyDate: date, startTime: time, durationMin: duration, capacity, meetingUrl: url.trim() || null, teacher: t }),
      "Lesson created."
    );
    if (ok) onClose();
  }

  return (
    <Modal onClose={onClose} labelledBy="oneoff-dialog-title" showCloseButton>
      <div className="max-h-[calc(100dvh-7rem)] w-full overflow-y-auto pr-1 text-left">
        <h3 id="oneoff-dialog-title" className="pr-8 text-xl font-extrabold">New one-off lesson</h3>
        <p className="mt-1 text-[0.82rem] text-text-muted">It happens once. Add students from the lesson, or they join it themselves.</p>
        <div className="mt-4 space-y-3.5">
          <Field label="Name">
            <input className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kanji workshop" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date (New York)">
              <input type="date" className={inputClass} min={todayNy} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time (New York)">
              <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Minutes">
              <input type="number" min={10} max={240} step={5} className={inputClass} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </Field>
            <Field label="Seats">
              <input type="number" min={1} max={3} className={inputClass} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </Field>
            <Field label="Level">
              <input className={inputClass} value={level} maxLength={40} onChange={(e) => setLevel(e.target.value)} />
            </Field>
          </div>
          <Field label="Teacher">
            <TeacherSelect overview={overview} value={teacher} onChange={setTeacher} />
          </Field>
          <Field label="Meeting link">
            <input className={inputClass} value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button loading={busy} disabled={!title.trim() || !teacher} onClick={() => void save()}>Create lesson</Button>
            <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { personName };
