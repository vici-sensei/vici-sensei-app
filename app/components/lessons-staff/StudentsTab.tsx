"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Toggle } from "@/app/components/ui/Toggle";
import {
  fetchStudentDetail,
  staffActions,
  type DirectoryStudent,
  type PersonRef,
  type StaffOverview,
  type StudentDetail,
} from "@/lib/client-data/lessonsStaff";
import { formatClock, formatKey, localDateKey } from "@/lib/lessons/time";
import type { Act } from "./OccurrenceDialog";
import { Avatar, Field, Pill, SectionTitle, inputClass, selectClass } from "./staffUi";

type Filter = "all" | "access" | "none" | "teachers";

function accessPill(s: DirectoryStudent) {
  if (s.is_teacher) return <Pill tone="blue">Teacher</Pill>;
  const l = s.lessons;
  if (!l || !l.access) return <Pill tone="muted">Off</Pill>;
  if (!l.has_access) return <Pill tone="red">Ended</Pill>;
  if (l.access_until) return <Pill tone="gold">Until {formatKey(localDateKey(Date.parse(l.access_until), "UTC"), { day: "numeric", month: "short" })}</Pill>;
  return <Pill tone="green">Open</Pill>;
}

/** Everyone with an account: who can book lessons, and the teacher flag (admins). */
export function StudentsTab({
  students,
  loading,
  error,
  overview,
  role,
  tz,
  busy,
  act,
}: {
  students: DirectoryStudent[] | null;
  loading: boolean;
  error: string | null;
  overview: StaffOverview | null;
  role: "admin" | "teacher";
  tz: string;
  busy: boolean;
  act: Act;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<PersonRef | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students ?? [])
      .filter((s) => (filter === "teachers" ? s.is_teacher : !s.is_teacher))
      .filter((s) => (filter === "access" ? s.lessons?.has_access : filter === "none" ? !s.lessons?.has_access : true))
      .filter((s) => !q || (s.display_name ?? "").toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q));
  }, [students, query, filter]);

  const selected = open && students?.find((s) => s.region === open.region && s.user_id === open.user_id);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="search" className={`${inputClass} !w-full sm:!w-72`} placeholder="Search by name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search students" />
        <PillSelector
          variant="compact"
          active={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "Students" },
            { value: "access", label: "With access" },
            { value: "none", label: "Without access" },
            ...(role === "admin" ? [{ value: "teachers" as const, label: "Teachers" }] : []),
          ]}
        />
      </div>

      {loading && !students ? <Skeleton className="h-40 w-full" /> : null}
      {error && !students ? <p className="text-[0.88rem] text-[#ff8a93]">{error}</p> : null}
      {students && rows.length === 0 ? <p className="text-[0.88rem] text-text-muted">Nobody matches.</p> : null}

      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={`${s.region}:${s.user_id}`}>
            <button
              type="button"
              onClick={() => setOpen({ region: s.region, user_id: s.user_id })}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border-soft bg-white/[0.03] px-3.5 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
            >
              <Avatar name={s.display_name ?? "?"} src={s.avatar_url} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{s.display_name ?? "Unnamed"}</span>
                <span className="block truncate text-[0.76rem] text-text-muted">
                  {s.email ?? (s.lessons?.tz ?? "")}
                  {s.email && s.lessons?.tz ? ` · ${s.lessons.tz}` : ""}
                </span>
              </span>
              {s.lessons && !s.is_teacher ? (
                <span className="hidden text-[0.78rem] text-text-muted sm:block">
                  {s.lessons.fixed}/{s.lessons.weekly_quota} weekly{s.lessons.can_move ? "" : " · locked"}
                </span>
              ) : null}
              {accessPill(s)}
            </button>
          </li>
        ))}
      </ul>

      {selected ? <StudentDialog student={selected} overview={overview} role={role} tz={tz} busy={busy} act={act} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function StudentDialog({
  student,
  overview,
  role,
  tz,
  busy,
  act,
  onClose,
}: {
  student: DirectoryStudent;
  overview: StaffOverview | null;
  role: "admin" | "teacher";
  tz: string;
  busy: boolean;
  act: Act;
  onClose: () => void;
}) {
  const l = student.lessons;
  const [access, setAccess] = useState(l?.access ?? false);
  const [until, setUntil] = useState(l?.access_until ? localDateKey(Date.parse(l.access_until), "UTC") : "");
  const [canMove, setCanMove] = useState(l?.can_move ?? true);
  const [quota, setQuota] = useState(l?.weekly_quota ?? 1);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [joinClass, setJoinClass] = useState("");
  const [confirmTeacher, setConfirmTeacher] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchStudentDetail(student)
      .then((d) => !cancelled && (setDetail(d), setDetailError(null)))
      .catch((e: unknown) => !cancelled && setDetailError(e instanceof Error ? e.message : "Couldn't load their details."));
    return () => {
      cancelled = true;
    };
  }, [student, reloadKey]);

  const run: Act = async (task, success) => {
    const ok = await act(task, success);
    if (ok) setReloadKey((k) => k + 1);
    return ok;
  };

  const weeklyClasses = (overview?.classes ?? []).filter((c) => c.kind === "weekly");
  const inClasses = new Set(detail?.fixed?.map((f) => f.class_id));

  return (
    <Modal onClose={onClose} labelledBy="student-dialog-title" showCloseButton>
      <div className="max-h-[calc(100dvh-7rem)] w-full overflow-y-auto pr-1 text-left">
        <div className="flex items-center gap-3 pr-8">
          <Avatar name={student.display_name ?? "?"} src={student.avatar_url} size={44} />
          <div className="min-w-0">
            <h3 id="student-dialog-title" className="truncate text-xl font-extrabold">{student.display_name ?? "Unnamed"}</h3>
            <p className="truncate text-[0.8rem] text-text-muted">{student.email ?? ""}{student.email && detail?.tz ? " · " : ""}{detail?.tz ?? ""}</p>
          </div>
        </div>

        {student.is_teacher ? (
          <div className="mt-5 rounded-xl border border-accent-blue/30 bg-accent-blue/[0.06] p-4 text-[0.88rem]">
            This is a teacher account: it teaches classes and does not book lessons.
            {role === "admin" ? (
              <div className="mt-3">
                <Button size="sm" variant="secondary" loading={busy} onClick={() => void run(() => staffActions.setTeacher(student, false), "No longer a teacher.")}>
                  Remove teacher status
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-border-soft bg-white/[0.02] p-4">
              <SectionTitle>Lesson booking</SectionTitle>
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[0.9rem] font-bold">Can book lessons</span>
                  <Toggle checked={access} onChange={() => setAccess((a) => !a)} aria-label="Can book lessons" />
                </div>
                {access ? (
                  <>
                    <Field label="Access ends (optional)" hint="Their seats after this date are released. Leave empty for no end.">
                      <input type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
                    </Field>
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-[0.9rem] font-bold">Can change their own lessons</span>
                        <span className="block text-[0.76rem] text-text-muted">Off: they keep what is booked but cannot move or leave.</span>
                      </span>
                      <Toggle checked={canMove} onChange={() => setCanMove((c) => !c)} aria-label="Can change their own lessons" />
                    </div>
                    <Field label="Lessons per week">
                      <input type="number" min={1} max={7} className={inputClass} value={quota} onChange={(e) => setQuota(Number(e.target.value))} />
                    </Field>
                  </>
                ) : null}
                <Button
                  size="sm"
                  loading={busy}
                  onClick={() =>
                    void run(
                      () => staffActions.setAccess(student, { access, accessUntil: access && until ? `${until}T00:00:00Z` : null, canMove, weeklyQuota: quota }),
                      "Saved."
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>

            <div className="mt-5">
              <SectionTitle>Weekly classes</SectionTitle>
              {!detail && !detailError ? <Skeleton className="h-12 w-full" /> : null}
              {detailError ? <p className="text-[0.84rem] text-[#ff8a93]">{detailError}</p> : null}
              {detail && (detail.fixed?.length ?? 0) === 0 ? <p className="text-[0.86rem] text-text-muted">None yet.</p> : null}
              <ul className="space-y-1.5">
                {detail?.fixed?.map((f) => (
                  <li key={f.class_id} className="flex items-center justify-between gap-2 rounded-lg border border-border-soft bg-white/[0.03] px-3 py-2 text-[0.86rem]">
                    <span>
                      <strong>{f.title}</strong>
                      <span className="text-text-muted"> · next {formatKey(localDateKey(Date.parse(f.next_starts_at), tz), { weekday: "short", day: "numeric", month: "short" })} {formatClock(Date.parse(f.next_starts_at), tz)}</span>
                    </span>
                    <button type="button" className="cursor-pointer text-[0.78rem] font-bold text-[#ff8a93] hover:underline" disabled={busy} onClick={() => void run(() => staffActions.unenroll(student, f.class_id), "Removed from the class.")}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {l?.has_access && weeklyClasses.length > 0 ? (
                <div className="mt-3 flex gap-2">
                  <select className={selectClass} value={joinClass} onChange={(e) => setJoinClass(e.target.value)} aria-label="Add to a weekly class">
                    <option value="">Add to a weekly class…</option>
                    {weeklyClasses
                      .filter((c) => !inClasses.has(c.class_id))
                      .map((c) => (
                        <option key={c.class_id} value={c.class_id}>
                          {c.versions[0]?.title}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" variant="secondary" disabled={!joinClass} loading={busy} onClick={() => void run(() => staffActions.enroll(student, joinClass), "Added to the class.").then((ok) => ok && setJoinClass(""))}>
                    Add
                  </Button>
                </div>
              ) : null}
            </div>

            {detail?.upcoming && detail.upcoming.length > 0 ? (
              <div className="mt-5">
                <SectionTitle>Next 4 weeks</SectionTitle>
                <ul className="space-y-1 text-[0.84rem]">
                  {detail.upcoming.map((u) => (
                    <li key={`${u.class_id}|${u.ny_date}`} className="flex justify-between gap-2">
                      <span>{u.title}</span>
                      <span className="text-text-muted">{formatKey(localDateKey(Date.parse(u.starts_at), tz), { weekday: "short", day: "numeric", month: "short" })} {formatClock(Date.parse(u.starts_at), tz)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {detail?.history && detail.history.length > 0 ? (
              <div className="mt-5">
                <SectionTitle>Attendance</SectionTitle>
                <ul className="space-y-1 text-[0.84rem]">
                  {detail.history.map((h) => (
                    <li key={`${h.class_id}|${h.ny_date}`} className="flex items-center justify-between gap-2">
                      <span>{h.title} <span className="text-text-muted">· {formatKey(h.ny_date, { day: "numeric", month: "short" })}</span></span>
                      <Pill tone={h.status === "present" ? "green" : "red"}>{h.status === "present" ? "Present" : "Absent"}</Pill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {role === "admin" ? (
              <div className="mt-6 border-t border-border-soft pt-4">
                {confirmTeacher ? (
                  <div className="text-[0.86rem]">
                    <p>Make {student.display_name ?? "this account"} a teacher? They stop being a student: their weekly classes and lessons are released.</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" danger loading={busy} onClick={() => void run(() => staffActions.setTeacher(student, true), "Now a teacher.").then(() => setConfirmTeacher(false))}>Yes, make a teacher</Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmTeacher(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="cursor-pointer text-[0.82rem] font-bold text-accent-blue hover:underline" onClick={() => setConfirmTeacher(true)}>
                    Make this account a teacher
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  );
}
