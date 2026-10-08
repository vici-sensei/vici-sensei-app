"use client";

import { useState } from "react";
import { FaArrowUpRightFromSquare, FaCalendarDays, FaChalkboardUser, FaEarthAmericas } from "react-icons/fa6";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import {
  personName,
  profileKey,
  staffActions,
  type DirectoryStudent,
  type PersonRef,
  type StaffAttendee,
  type StaffOccurrence,
  type StaffOverview,
} from "@/lib/client-data/lessonsStaff";
import { NY_TZ, addDaysKey, formatKey, formatTimeRange, localDateKey, wallClock, zoneAbbreviation } from "@/lib/lessons/time";
import { SeatDots } from "@/app/(shell)/lessons/LessonCard";
import { StudentPicker } from "./StudentPicker";
import { Field, Person, Pill, SectionTitle, inputClass, selectClass } from "./staffUi";

/** Runs a change: toast, reload, true on success. A task may answer `{ warning }` to say "done, but...". */
export type Act = (task: () => Promise<unknown>, success: string) => Promise<boolean>;

interface Props {
  occ: StaffOccurrence;
  overview: StaffOverview;
  students: DirectoryStudent[] | null;
  tz: string;
  nowMs: number;
  busy: boolean;
  act: Act;
  onClose: () => void;
}

type AddMode = "weekly" | "once" | "extra";

const SOURCE_LABEL = { standing: "Weekly", move: "This lesson only", extra: "Extra" } as const;

const pad = (n: number) => String(n).padStart(2, "0");

export function OccurrenceDialog({ occ, overview, students, tz, nowMs, busy, act, onClose }: Props) {
  const startMs = Date.parse(occ.starts_at);
  const endMs = Date.parse(occ.ends_at);
  const started = startMs <= nowMs;
  const admin = overview.role === "admin";
  const cls = overview.classes.find((c) => c.class_id === occ.class_id);
  const people = overview.people;
  const weekly = occ.kind === "weekly";

  const nyEff = wallClock(startMs, NY_TZ);
  const [section, setSection] = useState<"attendees" | "add" | "change">("attendees");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // add a student
  const [student, setStudent] = useState<PersonRef | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(weekly ? "weekly" : "once");
  const [reason, setReason] = useState("");
  const [fromHere, setFromHere] = useState(false);

  // change the lesson
  const [cancelReason, setCancelReason] = useState("");
  const [moveDate, setMoveDate] = useState(`${nyEff.year}-${pad(nyEff.month)}-${pad(nyEff.day)}`);
  const [moveTime, setMoveTime] = useState(`${pad(nyEff.hour)}:${pad(nyEff.minute)}`);
  const [url, setUrl] = useState(occ.meeting_url ?? "");
  const [substitute, setSubstitute] = useState(
    occ.teacher.user_id !== occ.regular_teacher.user_id ? `${occ.teacher.region}:${occ.teacher.user_id}` : ""
  );

  const moved = occ.original_starts_at !== null;
  const substituted = occ.teacher.user_id !== occ.regular_teacher.user_id || occ.teacher.region !== occ.regular_teacher.region;
  const full = occ.taken >= occ.capacity;
  const attending = new Set(occ.attendees.map(profileKey));

  const extraFor = (a: StaffAttendee) =>
    cls?.extras.find(
      (x) => x.region === a.region && x.user_id === a.user_id && x.from_date <= occ.ny_date && (x.to_date === null || occ.ny_date < x.to_date)
    );

  function removeAttendee(a: StaffAttendee) {
    if (a.source === "standing") return act(() => staffActions.unenroll(a, occ.class_id), "Removed from the class.");
    if (a.source === "move") return act(() => staffActions.unmove(a, { classId: occ.class_id, nyDate: occ.ny_date }), "Removed from this lesson.");
    const extra = extraFor(a);
    return extra ? act(() => staffActions.removeExtra(extra.id), "Removed.") : Promise.resolve(false);
  }

  async function addStudent() {
    if (!student) return;
    let ok: boolean;
    if (addMode === "weekly") ok = await act(() => staffActions.enroll(student, occ.class_id), "Added to the class every week.");
    else if (addMode === "once")
      ok = await act(() => staffActions.moveOnce(student, { classId: occ.class_id, nyDate: occ.ny_date }, null), "Added to this lesson.");
    else
      ok = await act(
        () => staffActions.addExtra(student, occ.class_id, occ.ny_date, fromHere ? null : addDaysKey(occ.ny_date, 1), reason),
        "Added as an extra attendee."
      );
    if (ok) {
      setStudent(null);
      setReason("");
    }
  }

  const tab = (id: typeof section, label: string) => (
    <button
      type="button"
      onClick={() => setSection(id)}
      className={`cursor-pointer rounded-lg px-3.5 py-2 text-[0.82rem] font-bold ${section === id ? "bg-white/10 text-white" : "text-text-muted hover:text-white"}`}
    >
      {label}
    </button>
  );

  const radioRow = "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-soft bg-white/[0.03] p-2.5 text-[0.84rem]";
  const radio = "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#ff4a5a]";

  return (
    <Modal onClose={onClose} labelledBy="occurrence-dialog-title" showCloseButton>
      <div className="max-h-[calc(100dvh-7rem)] w-full overflow-y-auto pr-1 text-left">
        <h3 id="occurrence-dialog-title" className="pr-8 text-xl font-extrabold leading-tight">
          {occ.title}
          {occ.level_label ? <span className="ml-2 align-middle rounded-md bg-white/10 px-2 py-0.5 text-xs font-extrabold text-text-muted">{occ.level_label}</span> : null}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {occ.cancelled ? <Pill tone="red">{occ.cancelled_by_vacation ? "Cancelled by a vacation" : "Cancelled"}</Pill> : null}
          {moved ? <Pill tone="orange">Moved</Pill> : null}
          {substituted ? <Pill tone="blue">Substitute teacher</Pill> : null}
          {occ.kind === "one_off" ? <Pill tone="gold">One-off</Pill> : null}
          {started && !occ.cancelled ? <Pill tone="green">Started</Pill> : null}
        </div>

        <ul className="mt-3 space-y-2 text-[0.88rem]">
          <li className="flex items-start gap-2.5">
            <FaCalendarDays className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
            <span>
              <strong>{formatKey(localDateKey(startMs, tz), { weekday: "long", month: "long", day: "numeric" })}</strong>
              <br />
              {formatTimeRange(startMs, endMs, tz)} <span className="text-text-muted">({zoneAbbreviation(startMs, tz)})</span>
              {moved ? (
                <span className="block text-[0.78rem] text-text-muted">
                  Usually {formatKey(localDateKey(Date.parse(occ.original_starts_at!), tz), { weekday: "short", month: "short", day: "numeric" })},{" "}
                  {formatTimeRange(Date.parse(occ.original_starts_at!), Date.parse(occ.original_starts_at!) + (endMs - startMs), tz)}
                </span>
              ) : null}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-text-muted">
            <FaEarthAmericas className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              New York: {formatKey(localDateKey(startMs, NY_TZ), { weekday: "short", month: "short", day: "numeric" })}, {formatTimeRange(startMs, endMs, NY_TZ)}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <FaChalkboardUser className="shrink-0 text-text-muted" aria-hidden="true" />
            <span>
              {personName(people, occ.teacher)}
              {substituted ? <span className="text-text-muted"> (instead of {personName(people, occ.regular_teacher)})</span> : null}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <SeatDots taken={occ.taken} capacity={occ.capacity} />
            <span className="text-text-muted">
              {occ.taken} of {occ.capacity} seats{full ? " · full" : ""}
              {occ.attendees.filter((a) => a.source === "extra").length ? ` · +${occ.attendees.filter((a) => a.source === "extra").length} extra` : ""}
            </span>
          </li>
          {occ.meeting_url ? (
            <li>
              <a href={occ.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-bold text-accent-blue hover:underline">
                <FaArrowUpRightFromSquare aria-hidden="true" />
                Open the lesson link
              </a>
            </li>
          ) : null}
          {occ.cancel_reason ? <li className="text-[0.82rem] text-text-muted">Reason: {occ.cancel_reason}</li> : null}
        </ul>

        <div className="mt-4 flex gap-1 rounded-xl border border-border-soft bg-white/[0.03] p-1">
          {tab("attendees", `Students (${occ.attendees.length})`)}
          {tab("add", "Add a student")}
          {tab("change", "Change this lesson")}
        </div>

        {section === "attendees" ? (
          <div className="mt-4">
            {occ.attendees.length === 0 ? <p className="text-[0.86rem] text-text-muted">Nobody is in this lesson.</p> : null}
            <ul className="space-y-2">
              {occ.attendees.map((a) => {
                const key = profileKey(a);
                return (
                  <li key={key} className="rounded-lg border border-border-soft bg-white/[0.03] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Person person={a} people={people} showEmail={admin} />
                      <Pill tone={a.source === "extra" ? "gold" : a.source === "move" ? "blue" : "muted"}>{SOURCE_LABEL[a.source]}</Pill>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {started && !occ.cancelled ? (
                        <span className="inline-flex gap-1" role="group" aria-label={`Attendance of ${personName(people, a)}`}>
                          {(["present", "absent"] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              disabled={busy}
                              aria-pressed={a.attendance === status}
                              onClick={() =>
                                void act(
                                  () => staffActions.markAttendance(a, occ.class_id, occ.ny_date, a.attendance === status ? null : status),
                                  a.attendance === status ? "Mark cleared." : `Marked ${status}.`
                                )
                              }
                              className={`cursor-pointer rounded-lg px-3 py-1 text-[0.78rem] font-bold disabled:opacity-50 ${
                                a.attendance === status
                                  ? status === "present"
                                    ? "bg-accent-green/20 text-accent-green"
                                    : "bg-accent-red/20 text-[#ff8a93]"
                                  : "bg-white/[0.06] text-text-muted hover:text-white"
                              }`}
                            >
                              {status === "present" ? "Present" : "Absent"}
                            </button>
                          ))}
                        </span>
                      ) : null}
                      {!started ? (
                        confirmRemove === key ? (
                          <span className="inline-flex items-center gap-2 text-[0.8rem]">
                            {a.source === "standing" ? "Remove from the class for good?" : "Remove?"}
                            <Button size="sm" danger loading={busy} onClick={() => void removeAttendee(a).then(() => setConfirmRemove(null))}>
                              Yes
                            </Button>
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmRemove(null)}>
                              No
                            </Button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirmRemove(key)} className="cursor-pointer text-[0.78rem] font-bold text-[#ff8a93] hover:underline">
                            {a.source === "standing" ? "Remove from class" : "Remove"}
                          </button>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {section === "add" ? (
          <div className="mt-4">
            {started ? (
              <p className="text-[0.86rem] text-text-muted">This lesson already started. Add the student to a later lesson.</p>
            ) : occ.cancelled ? (
              <p className="text-[0.86rem] text-text-muted">This lesson is cancelled.</p>
            ) : (
              <div className="space-y-3">
                <StudentPicker students={students} value={student} onChange={setStudent} exclude={[...attending].map((k) => ({ region: k.split(":")[0] as "eu" | "us", user_id: k.split(":")[1] }))} onlyWithAccess />
                {student ? (
                  <fieldset className="space-y-1.5">
                    <legend className="sr-only">How to add them</legend>
                    {weekly ? (
                      <label className={radioRow}>
                        <input type="radio" name="addmode" className={radio} checked={addMode === "weekly"} onChange={() => setAddMode("weekly")} />
                        <span>
                          <strong>Every week</strong>
                          <span className="block text-[0.76rem] text-text-muted">Their weekly class from now on. Needs a free seat.</span>
                        </span>
                      </label>
                    ) : null}
                    <label className={radioRow}>
                      <input type="radio" name="addmode" className={radio} checked={addMode === "once"} onChange={() => setAddMode("once")} />
                      <span>
                        <strong>Just this lesson</strong>
                        <span className="block text-[0.76rem] text-text-muted">One lesson, a seat, no change to their weekly class.</span>
                      </span>
                    </label>
                    <label className={radioRow}>
                      <input type="radio" name="addmode" className={radio} checked={addMode === "extra"} onChange={() => setAddMode("extra")} />
                      <span>
                        <strong>Extra attendee</strong>
                        <span className="block text-[0.76rem] text-text-muted">Over the seat limit or their weekly limit. Needs a reason.</span>
                      </span>
                    </label>
                  </fieldset>
                ) : null}
                {student && addMode === "extra" ? (
                  <>
                    <Field label="Reason">
                      <input className={inputClass} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. trial lesson" />
                    </Field>
                    {weekly ? (
                      <label className="flex cursor-pointer items-center gap-2 text-[0.84rem]">
                        <input type="checkbox" className={radio} checked={fromHere} onChange={(e) => setFromHere(e.target.checked)} />
                        Every lesson of this class from this one on
                      </label>
                    ) : null}
                  </>
                ) : null}
                <Button size="sm" disabled={!student || (addMode === "extra" && reason.trim().length === 0)} loading={busy} onClick={() => void addStudent()}>
                  Add student
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {section === "change" ? (
          <div className="mt-4 space-y-5">
            {started ? <p className="text-[0.86rem] text-text-muted">This lesson already started, so it can no longer be changed.</p> : null}

            {!started ? (
              <div>
                <SectionTitle>{occ.cancelled ? "Cancelled" : "Cancel this lesson"}</SectionTitle>
                {occ.cancelled ? (
                  occ.cancelled_by_vacation ? (
                    <p className="text-[0.82rem] text-text-muted">A vacation cancels it. Delete the vacation in the Vacations tab to bring it back.</p>
                  ) : (
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => void act(() => staffActions.restore(occ.class_id, occ.ny_date), "The lesson is back on.")}>
                      Bring the lesson back
                    </Button>
                  )
                ) : (
                  <>
                    <input className={inputClass} value={cancelReason} maxLength={200} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (optional, shown to the students)" aria-label="Reason" />
                    <Button size="sm" danger className="mt-2" loading={busy} onClick={() => void act(() => staffActions.cancel(occ.class_id, occ.ny_date, cancelReason.trim() || null), "The lesson is cancelled. Students were told.")}>
                      Cancel this lesson
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {!started && !occ.cancelled ? (
              <>
                <div>
                  <SectionTitle>Move to another day or time (New York time)</SectionTitle>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className={inputClass} value={moveDate} min={addDaysKey(occ.ny_date, -6)} max={addDaysKey(occ.ny_date, 6)} onChange={(e) => setMoveDate(e.target.value)} aria-label="New date" />
                    <input type="time" className={inputClass} value={moveTime} onChange={(e) => setMoveTime(e.target.value)} aria-label="New time" />
                  </div>
                  <p className="mt-1.5 text-[0.76rem] text-text-muted">At most 6 days from its usual day. Students are told, and can pick another class if it no longer suits them.</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
        void act(async () => {
                          const r = await staffActions.moveOccurrence(occ.class_id, occ.ny_date, { date: moveDate, time: moveTime });
                          return r.conflicts.length ? { warning: `Moved and students were told, but ${r.conflicts.length} of them now have another lesson at that time.` } : undefined;
                        }, "The lesson is moved. Students were told.")
                      }
                    >
                      Move
                    </Button>
                    {moved ? (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => staffActions.moveOccurrence(occ.class_id, occ.ny_date, null), "Back at the usual time.")}>
                        Back to the usual time
                      </Button>
                    ) : null}
                  </div>
                </div>

                {admin ? (
                  <div>
                    <SectionTitle>Substitute teacher</SectionTitle>
                    <select className={selectClass} value={substitute} onChange={(e) => setSubstitute(e.target.value)} aria-label="Substitute teacher">
                      <option value="">The regular teacher ({personName(people, occ.regular_teacher)})</option>
                      {overview.teachers
                        .filter((t) => !(t.region === occ.regular_teacher.region && t.user_id === occ.regular_teacher.user_id))
                        .map((t) => (
                          <option key={`${t.region}:${t.user_id}`} value={`${t.region}:${t.user_id}`}>
                            {t.display_name ?? "Unnamed"}
                          </option>
                        ))}
                    </select>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2"
                      loading={busy}
                      onClick={() => {
                        const [region, user_id] = substitute.split(":");
                        void act(
                          () => staffActions.setSubstitute(occ.class_id, occ.ny_date, substitute ? { region: region as "eu" | "us", user_id } : null),
                          substitute ? "Substitute set. Students were told." : "The regular teacher is back."
                        );
                      }}
                    >
                      Save teacher
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}

            {!started ? (
              <div>
                <SectionTitle>Link for this lesson only</SectionTitle>
                <input className={inputClass} value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label="Meeting link" />
                <Button size="sm" variant="secondary" className="mt-2" loading={busy} onClick={() => void act(() => staffActions.setMeetingUrl(occ.class_id, occ.ny_date, url.trim() || null), url.trim() ? "Link saved." : "Back to the class link.")}>
                  Save link
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
